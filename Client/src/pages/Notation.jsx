// page imports
import { useState, useEffect } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import Collaboration from '@tiptap/extension-collaboration';
import CollaborationCaret from '@tiptap/extension-collaboration-caret';
import { useAuth } from '../contexts/AuthContext';
import { useNotation } from '../contexts/NotationContext';
import { useNotationDocument } from '../hooks/useNotationDocument';
import { editorExtensions } from '../components/notation/EditorExtensions';
import NotationSidebar from '../components/notation/NotationSidebar';
import NotationSubbar from '../components/subbar/NotationSubbar';

// configuration constants
const DEFAULT_CURSOR = '#c8502a';

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
    const { notationData, loading, error, canEdit } = useNotation();

    // state variables
    const [activePageID, setActivePageID] = useState(null);
    const [sidebarOpen, setSidebarOpen] = useState(true);

    const { session, status } = useNotationDocument(activePageID);

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
        editor?.setEditable(canEdit);
    }, [editor, canEdit]);

    const activePage = notationData.pages.find(page => page.id === activePageID) ?? null;

    if (error) return <div className="route-loading">{error.message}</div>;

    return (
        <div className="notation-root">
            <NotationSubbar editor={session ? editor : null} status={status} canEdit={canEdit} />

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
                        onPageSelect={setActivePageID}
                    />
                )}

                <div className="notation-editor-area">
                    {loading && <p className="notation-loading">Loading…</p>}

                    {!loading && !activePage && (
                        <p className="notation-loading">Select a page to get started</p>
                    )}

                    {!loading && activePage && session && (
                        <EditorContent editor={editor} className="notation-editor" />
                    )}
                </div>
            </div>
        </div>
    );
}
