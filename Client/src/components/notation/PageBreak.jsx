// import modules
import { Node, mergeAttributes } from '@tiptap/core';

// extension definition
export const PageBreak = Node.create({
    name: 'pageBreak',
    group: 'block',
    atom: true,
    selectable: true,

    parseHTML() {
        return [{ tag: 'div[data-page-break]' }];
    },

    renderHTML({ HTMLAttributes }) {
        return ['div', mergeAttributes(HTMLAttributes, { 'data-page-break': 'true' })];
    },

    addCommands() {
        return {
            insertPageBreak: () => ({ chain }) =>
                chain()
                    .insertContent([{ type: this.name }, { type: 'paragraph' }])
                    .focus()
                    .run()
        };
    },

    addKeyboardShortcuts() {
        return {
            'Mod-Enter': () => this.editor.commands.insertPageBreak()
        };
    }
});