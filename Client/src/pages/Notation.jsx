// page imports
import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useEditor, EditorContent } from '@tiptap/react';
import Collaboration from '@tiptap/extension-collaboration';
import CollaborationCaret from '@tiptap/extension-collaboration-caret';
import { useAuth } from '../contexts/AuthContext';
import { useNotation } from '../contexts/NotationContext';
import { useNotationDocument } from '../hooks/useNotationDocument';
import { useNotationSidebar } from '../hooks/useNotationSidebar';
import { editorExtensions } from '../components/notation/EditorExtensions';
import { uploadImage } from '../lib/image';
import NotationSidebar from '../components/notation/NotationSidebar';
import EditorContextMenu from '../components/notation/EditorContextMenu';
import StickyLayer from '../components/notation/StickyLayer';
import { useStickyNotes } from '../hooks/useStickyNotes';
import NotationSubbar from '../components/subbar/NotationSubbar';

// configuration constants
const DEFAULT_CURSOR = '#c8502a';
const PAGE_STORAGE_PREFIX = 'nodelit:notationpage:';

// utility functions
function readStoredPage(workspaceID) {
    if (!workspaceID) return null;

    try {
        return localStorage.getItem(`${PAGE_STORAGE_PREFIX}${workspaceID}`);
    } catch {
        return null;
    }
}

function persistPage(workspaceID, pageID) {
    if (!workspaceID || !pageID) return;

    try {
        localStorage.setItem(`${PAGE_STORAGE_PREFIX}${workspaceID}`, pageID);
    } catch {
        return;
    }
}

// utility functions
function renderCaret(user) {
    const caret = document.createElement('span');
    caret.classList.add('collab-cursor');
    caret.style.borderColor = user.color;

    const label = document.createElement('span');
    label.classList.add('collab-cursor__label');
    label.style.background = user.color;
    label.textContent = user.name;

    caret.appendChild(label);
    return caret;
}

// page functions
export default function Notation() {
    const { user } = useAuth();
    const { notationData, loading, error, canEdit, workspaceID, setActionError } = useNotation();
    const { setPageLayout } = useNotationSidebar();

    // state variables
    const [activePageID, setActivePageID] = useState(null);
    const [searchParams, setSearchParams] = useSearchParams();
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [reading, setReading] = useState(false);

    const selectPage = useCallback(pageID => {
        setActivePageID(pageID);
        persistPage(workspaceID, pageID);

        const next = new URLSearchParams(searchParams);

        if (pageID) next.set('page', pageID);
        else next.delete('page');

        setSearchParams(next, { replace: true });
    }, [workspaceID, searchParams, setSearchParams]);

    const handleUpload = useCallback(
        file => uploadImage(workspaceID, file),
        [workspaceID]
    );

    const layerRef = useRef(null);

    const { session, status } = useNotationDocument(activePageID);
    const { notes, createNote, updateNote, deleteNote } = useStickyNotes(session?.ydoc ?? null);

    const editor = useEditor({
        editable: canEdit,
        extensions: session
            ? [
                ...editorExtensions,
                Collaboration.configure({ document: session.ydoc }),
                CollaborationCaret.configure({
                    provider: session.provider,
                    user: {
                        name: user?.displayName ?? user?.username ?? 'Anonymous',
                        color: user?.cursorColor ?? DEFAULT_CURSOR
                    },
                    render: renderCaret
                })
            ]
            : editorExtensions
    }, [session]);

    // lifecycle functions
    useEffect(() => {
        if (loading || notationData.pages.length === 0) return;

        const exists = id => notationData.pages.some(page => page.id === id);

        if (activePageID && exists(activePageID)) return;

        const requested = searchParams.get('page');
        if (requested && exists(requested)) {
            setActivePageID(requested);
            persistPage(workspaceID, requested);
            return;
        }

        const remembered = readStoredPage(workspaceID);
        if (remembered && exists(remembered)) {
            setActivePageID(remembered);
            return;
        }

        setActivePageID(notationData.pages[0].id);
    }, [loading, notationData.pages, activePageID, searchParams, workspaceID]);

    useEffect(() => {
        editor?.setEditable(canEdit && !reading);
    }, [editor, canEdit, reading]);

    useEffect(() => {
        if (!editor?.storage?.notationImage) return;

        editor.storage.notationImage.upload = handleUpload;
        editor.storage.notationImage.onError = setActionError;
    }, [editor, handleUpload, setActionError]);

    const activePage = notationData.pages.find(page => page.id === activePageID) ?? null;
    const layout = activePage?.layout ?? 'pageless';

    const editable = canEdit && !reading;

    const addStickyAt = useCallback(point => {
        const layer = layerRef.current;

        if (!layer || !point) {
            createNote({ x: 24, y: 24 });
            return;
        }

        const rect = layer.getBoundingClientRect();
        createNote({ x: point.x - rect.left, y: point.y - rect.top });
    }, [createNote]);

    const view = {
        reading,
        layout,
        canEdit,
        onAddSticky: () => addStickyAt(null),
        onAddImage: file => handleUpload(file)
            .then(image => editor?.commands.insertNotationImage({
                imageID: image.id,
                ratio: `${image.width} / ${image.height}`
            }))
            .catch(err => setActionError(err.message)),
        onReading: setReading,
        onLayout: next => { if (activePageID) setPageLayout(activePageID, next); }
    };

    if (error) return <div className="route-loading">{error.message}</div>;

    return (
        <div className="notation-root">
            <NotationSubbar
                editor={session ? editor : null}
                status={status}
                canEdit={canEdit}
                view={view}
            />

            <div className="notation-body">
                <button
                    className={`notation-sidebar-toggle ${sidebarOpen ? 'open' : ''}`}
                    onClick={() => setSidebarOpen(open => !open)}
                    title={sidebarOpen ? 'Hide pages' : 'Show pages'}
                >
                    ‹
                </button>

                {sidebarOpen && (
                    <NotationSidebar
                        activePageID={activePageID}
                        onPageSelect={selectPage}
                    />
                )}

                <div className="notation-editor-area">
                    {loading && <p className="notation-loading">Loading…</p>}

                    {!loading && !activePage && (
                        <p className="notation-loading">Select a page to get started</p>
                    )}

                    {!loading && activePage && session && (
                        <EditorContextMenu
                            editor={editor}
                            canEdit={canEdit}
                            reading={reading}
                            boundsRef={layerRef}
                            onAddSticky={addStickyAt}
                        />
                    )}

                    {!loading && activePage && session && (
                        <StickyLayer
                            editor={editor}
                            layerRef={layerRef}
                            notes={notes}
                            editable={editable}
                            onUpdate={updateNote}
                            onDelete={deleteNote}
                        >
                            <EditorContent
                                editor={editor}
                                className={`notation-editor notation-editor--${layout} ${reading ? 'notation-editor--reading' : ''}`}
                            />
                        </StickyLayer>
                    )}
                </div>
            </div>
        </div>
    );
}