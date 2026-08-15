// import modules
import { useState, useCallback, useEffect } from 'react';
import ContextMenu, { ContextMenuItem, ContextMenuDivider } from './ContextMenu';

// configuration constants
const TABLE_ROWS = 3;
const TABLE_COLUMNS = 3;

// utility functions
function safeURL(value) {
    try {
        const url = new URL(value, window.location.origin);
        return ['http:', 'https:', 'mailto:'].includes(url.protocol) ? url.href : null;
    } catch {
        return null;
    }
}

function selectionText(editor) {
    const { from, to } = editor.state.selection;
    return editor.state.doc.textBetween(from, to, '\n');
}

function placeCursor(editor, event) {
    const position = editor.view.posAtCoords({ left: event.clientX, top: event.clientY });
    if (!position) return;

    const { from, to } = editor.state.selection;
    if (position.pos >= from && position.pos <= to && from !== to) return;

    editor.commands.setTextSelection(position.pos);
}

// component functions
export default function EditorContextMenu({ editor, canEdit, reading }) {
    const [position, setPosition] = useState(null);

    const close = useCallback(() => setPosition(null), []);

    useEffect(() => {
        if (!editor) return undefined;

        function handleContextMenu(event) {
            if (event.shiftKey) return;
            if (!editor.view.dom.contains(event.target)) return;

            event.preventDefault();
            placeCursor(editor, event);
            setPosition({ x: event.clientX, y: event.clientY });
        }

        document.addEventListener('contextmenu', handleContextMenu);
        return () => document.removeEventListener('contextmenu', handleContextMenu);
    }, [editor]);

    if (!editor || !position) return null;

    const editable = canEdit && !reading;
    const hasSelection = !editor.state.selection.empty;
    const inTable = editor.isActive('table');
    const onLink = editor.isActive('link');

    function run(action) {
        action();
        close();
    }

    async function copySelection() {
        try {
            await navigator.clipboard.writeText(selectionText(editor));
        } catch {
            return;
        }
    }

    function editLink() {
        const previous = editor.getAttributes('link').href ?? '';
        const input = window.prompt('Enter URL', previous);

        if (input === null) return;

        if (input.trim() === '') {
            editor.chain().focus().extendMarkRange('link').unsetLink().run();
            return;
        }

        const href = safeURL(input.trim());

        if (!href) {
            window.alert('That link is not a valid web address');
            return;
        }

        editor.chain().focus().extendMarkRange('link').setLink({ href }).run();
    }

    return (
        <ContextMenu position={position} onClose={close}>
            <ContextMenuItem onSelect={() => run(copySelection)} disabled={!hasSelection}>
                Copy
            </ContextMenuItem>

            <ContextMenuItem
                onSelect={() => run(async () => {
                    await copySelection();
                    editor.chain().focus().deleteSelection().run();
                })}
                disabled={!hasSelection || !editable}
            >
                Cut
            </ContextMenuItem>

            {onLink && (
                <>
                    <ContextMenuDivider />

                    <ContextMenuItem
                        onSelect={() => run(() => {
                            const href = safeURL(editor.getAttributes('link').href ?? '');
                            if (href) window.open(href, '_blank', 'noopener,noreferrer');
                        })}
                    >
                        Open link
                    </ContextMenuItem>

                    <ContextMenuItem onSelect={() => run(editLink)} disabled={!editable}>
                        Edit link
                    </ContextMenuItem>

                    <ContextMenuItem
                        onSelect={() => run(() => editor.chain().focus().extendMarkRange('link').unsetLink().run())}
                        disabled={!editable}
                    >
                        Remove link
                    </ContextMenuItem>
                </>
            )}

            {editable && !onLink && (
                <>
                    <ContextMenuDivider />

                    <ContextMenuItem onSelect={() => run(editLink)} disabled={!hasSelection}>
                        Link
                    </ContextMenuItem>
                </>
            )}

            {editable && inTable && (
                <>
                    <ContextMenuDivider />

                    <ContextMenuItem onSelect={() => run(() => editor.chain().focus().addRowAfter().run())}>
                        Row below
                    </ContextMenuItem>

                    <ContextMenuItem onSelect={() => run(() => editor.chain().focus().addColumnAfter().run())}>
                        Column after
                    </ContextMenuItem>

                    <ContextMenuItem onSelect={() => run(() => editor.chain().focus().deleteRow().run())}>
                        Delete row
                    </ContextMenuItem>

                    <ContextMenuItem onSelect={() => run(() => editor.chain().focus().deleteColumn().run())}>
                        Delete column
                    </ContextMenuItem>

                    <ContextMenuItem onSelect={() => run(() => editor.chain().focus().mergeOrSplit().run())}>
                        Merge or split
                    </ContextMenuItem>

                    <ContextMenuItem
                        onSelect={() => run(() => editor.chain().focus().deleteTable().run())}
                        danger
                    >
                        Delete table
                    </ContextMenuItem>
                </>
            )}

            {editable && !inTable && (
                <>
                    <ContextMenuDivider />

                    <ContextMenuItem
                        onSelect={() => run(() => editor.chain().focus()
                            .insertTable({ rows: TABLE_ROWS, cols: TABLE_COLUMNS, withHeaderRow: true })
                            .run())}
                    >
                        Insert table
                    </ContextMenuItem>

                    <ContextMenuItem onSelect={() => run(() => editor.chain().focus().toggleCodeBlock().run())}>
                        Code block
                    </ContextMenuItem>
                </>
            )}

            {editable && (
                <>
                    <ContextMenuDivider />

                    <ContextMenuItem onSelect={() => run(() => editor.commands.indentBlock())}>
                        Increase indent
                    </ContextMenuItem>

                    <ContextMenuItem onSelect={() => run(() => editor.commands.outdentBlock())}>
                        Decrease indent
                    </ContextMenuItem>
                </>
            )}
        </ContextMenu>
    );
}
