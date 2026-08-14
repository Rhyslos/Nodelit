// import modules
import { Extension } from '@tiptap/core';

// extension definition
export const FontSize = Extension.create({
    name: 'fontSize',

    addOptions() {
        return { types: ['textStyle'] };
    },

    addGlobalAttributes() {
        return [
            {
                types: this.options.types,
                attributes: {
                    fontSize: {
                        default: null,
                        parseHTML: element => element.style.fontSize || null,
                        renderHTML: attributes => {
                            if (!attributes.fontSize) return {};
                            return { style: `font-size: ${attributes.fontSize}` };
                        }
                    }
                }
            }
        ];
    },

    addCommands() {
        return {
            setFontSize: fontSize => ({ chain }) =>
                chain().setMark('textStyle', { fontSize: `${parseInt(fontSize, 10)}px` }).run(),
            unsetFontSize: () => ({ chain }) =>
                chain().setMark('textStyle', { fontSize: null }).run()
        };
    }
});
