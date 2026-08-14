// import modules
import { Extension } from '@tiptap/core';

// configuration constants
const INDENT_STEP = 32;
const INDENT_MAX = 320;

// utility functions
function listItemType(editor) {
    if (editor.isActive('taskItem')) return 'taskItem';
    if (editor.isActive('listItem')) return 'listItem';
    return null;
}

function shiftBlocks(state, dispatch, types, direction) {
    const { from, to } = state.selection;
    const transaction = state.tr;
    let changed = false;

    state.doc.nodesBetween(from, to, (node, position) => {
        if (!types.includes(node.type.name)) return;

        const current = node.attrs.indent ?? 0;
        const next = Math.max(0, Math.min(INDENT_MAX, current + direction * INDENT_STEP));

        if (next === current) return;

        transaction.setNodeMarkup(position, undefined, { ...node.attrs, indent: next });
        changed = true;
    });

    if (!changed) return false;
    if (dispatch) dispatch(transaction);

    return true;
}

// extension definition
export const Indent = Extension.create({
    name: 'indent',
    priority: 1000,

    addOptions() {
        return { types: ['paragraph', 'heading'] };
    },

    addGlobalAttributes() {
        return [
            {
                types: this.options.types,
                attributes: {
                    indent: {
                        default: 0,
                        parseHTML: element => parseInt(element.style.marginLeft, 10) || 0,
                        renderHTML: attributes => {
                            if (!attributes.indent) return {};
                            return { style: `margin-left: ${attributes.indent}px` };
                        }
                    }
                }
            }
        ];
    },

    addCommands() {
        return {
            indentBlock: () => ({ editor, state, dispatch, chain }) => {
                const item = listItemType(editor);

                if (item) return chain().focus().sinkListItem(item).run();

                return shiftBlocks(state, dispatch, this.options.types, 1);
            },

            outdentBlock: () => ({ editor, state, dispatch, chain }) => {
                const item = listItemType(editor);

                if (item) return chain().focus().liftListItem(item).run();

                return shiftBlocks(state, dispatch, this.options.types, -1);
            }
        };
    },

    addKeyboardShortcuts() {
        return {
            Tab: () => {
                if (this.editor.isActive('table')) return false;
                return this.editor.commands.indentBlock();
            },
            'Shift-Tab': () => {
                if (this.editor.isActive('table')) return false;
                return this.editor.commands.outdentBlock();
            }
        };
    }
});
