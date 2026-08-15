// import modules
import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

// configuration constants
const floatsKey = new PluginKey('stickyFloats');

// utility functions
function buildDecorations(doc, floats) {
    const widgets = floats.map(float => Decoration.widget(
        0,
        () => {
            const element = document.createElement('div');

            element.className = 'notation-sticky-float';
            element.contentEditable = 'false';
            element.style.float = float.side;
            element.style.width = `${float.width}px`;
            element.style.height = `${float.height}px`;
            element.style.shapeOutside = `inset(${float.top}px 0 0 0)`;

            return element;
        },
        {
            side: -1,
            ignoreSelection: true,
            key: `${float.id}:${float.side}:${float.top}:${float.width}:${float.height}`
        }
    ));

    return DecorationSet.create(doc, widgets);
}

// extension definition
export const StickyFloats = Extension.create({
    name: 'stickyFloats',

    addCommands() {
        return {
            setStickyFloats: floats => ({ tr, dispatch }) => {
                if (dispatch) dispatch(tr.setMeta(floatsKey, floats));
                return true;
            }
        };
    },

    addProseMirrorPlugins() {
        return [
            new Plugin({
                key: floatsKey,

                state: {
                    init() {
                        return DecorationSet.empty;
                    },

                    apply(transaction, value, oldState, newState) {
                        const floats = transaction.getMeta(floatsKey);
                        if (floats) return buildDecorations(newState.doc, floats);

                        return value.map(transaction.mapping, transaction.doc);
                    }
                },

                props: {
                    decorations(state) {
                        return floatsKey.getState(state);
                    }
                }
            })
        ];
    }
});
