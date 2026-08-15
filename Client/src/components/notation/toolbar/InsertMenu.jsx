// import modules
import { useCallback } from 'react';
import { useEditorState } from '@tiptap/react';
import ToolbarMenu, { ToolbarMenuItem, ToolbarMenuDivider } from './ToolbarMenu';

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

// component functions
export default function InsertMenu({ editor }) {
    const state = useEditorState({
        editor,
        selector: ({ editor: instance }) => ({
            isLink: instance.isActive('link'),
            inTable: instance.isActive('table')
        })
    });

    const setLink = useCallback(() => {
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
    }, [editor]);

    return (
        <div className="subbar-section">
            <ToolbarMenu label="Insert" title="Insert">
                <ToolbarMenuItem onSelect={setLink}>
                    {state.isLink ? 'Edit link' : 'Link'}
                </ToolbarMenuItem>

                <ToolbarMenuItem
                    onSelect={() => editor.chain().focus().unsetLink().run()}
                    disabled={!state.isLink}
                >
                    Remove link
                </ToolbarMenuItem>

                <ToolbarMenuDivider />

                <ToolbarMenuItem onSelect={() => editor.chain().focus().toggleCodeBlock().run()}>
                    Code block
                </ToolbarMenuItem>

                <ToolbarMenuDivider />

                <ToolbarMenuItem
                    onSelect={() => editor.chain().focus()
                        .insertTable({ rows: TABLE_ROWS, cols: TABLE_COLUMNS, withHeaderRow: true })
                        .run()}
                >
                    Table
                </ToolbarMenuItem>

                <ToolbarMenuItem
                    onSelect={() => editor.chain().focus().addRowAfter().run()}
                    disabled={!state.inTable}
                >
                    Row below
                </ToolbarMenuItem>

                <ToolbarMenuItem
                    onSelect={() => editor.chain().focus().addColumnAfter().run()}
                    disabled={!state.inTable}
                >
                    Column after
                </ToolbarMenuItem>

                <ToolbarMenuItem
                    onSelect={() => editor.chain().focus().deleteRow().run()}
                    disabled={!state.inTable}
                >
                    Delete row
                </ToolbarMenuItem>

                <ToolbarMenuItem
                    onSelect={() => editor.chain().focus().deleteColumn().run()}
                    disabled={!state.inTable}
                >
                    Delete column
                </ToolbarMenuItem>

                <ToolbarMenuItem
                    onSelect={() => editor.chain().focus().mergeOrSplit().run()}
                    disabled={!state.inTable}
                >
                    Merge or split
                </ToolbarMenuItem>

                <ToolbarMenuItem
                    onSelect={() => editor.chain().focus().toggleHeaderRow().run()}
                    disabled={!state.inTable}
                >
                    Header row
                </ToolbarMenuItem>

                <ToolbarMenuItem
                    onSelect={() => editor.chain().focus().deleteTable().run()}
                    disabled={!state.inTable}
                >
                    Delete table
                </ToolbarMenuItem>
            </ToolbarMenu>
        </div>
    );
}
