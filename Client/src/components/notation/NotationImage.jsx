// import modules
import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import NotationImageView from './NotationImageView';
import { isSupportedImage } from '../../lib/image';

// utility functions
function imageFiles(list) {
    return Array.from(list ?? []).filter(isSupportedImage);
}

// extension definition
export const NotationImage = Node.create({
    name: 'notationImage',
    group: 'block',
    atom: true,
    draggable: true,

    addStorage() {
        return { upload: null, onError: null };
    },

    addAttributes() {
        return {
            imageID: {
                default: null,
                parseHTML: element => element.getAttribute('data-image-id'),
                renderHTML: attributes => ({ 'data-image-id': attributes.imageID })
            },
            width: {
                default: null,
                parseHTML: element => {
                    const value = Number.parseInt(element.getAttribute('data-width'), 10);
                    return Number.isInteger(value) ? value : null;
                },
                renderHTML: attributes => (attributes.width ? { 'data-width': attributes.width } : {})
            },
            align: {
                default: 'center',
                parseHTML: element => element.getAttribute('data-align') ?? 'center',
                renderHTML: attributes => ({ 'data-align': attributes.align })
            },
            ratio: {
                default: null,
                parseHTML: element => element.getAttribute('data-ratio'),
                renderHTML: attributes => (attributes.ratio ? { 'data-ratio': attributes.ratio } : {})
            }
        };
    },

    parseHTML() {
        return [{ tag: 'figure[data-image-id]' }];
    },

    renderHTML({ HTMLAttributes }) {
        return ['figure', mergeAttributes(HTMLAttributes)];
    },

    addNodeView() {
        return ReactNodeViewRenderer(NotationImageView);
    },

    addCommands() {
        return {
            insertNotationImage: attributes => ({ commands }) =>
                commands.insertContent({ type: this.name, attrs: attributes })
        };
    },

    addProseMirrorPlugins() {
        const extension = this;

        async function ingest(files, position) {
            const { upload, onError } = extension.storage;
            if (!upload) return;

            for (const file of files) {
                try {
                    const image = await upload(file);
                    if (!image) continue;

                    const editor = extension.editor;
                    if (!editor || editor.isDestroyed) return;

                    const size = editor.state.doc.content.size;
                    const at = Math.min(Math.max(position ?? editor.state.selection.from, 0), size);

                    editor.chain().insertContentAt(at, {
                        type: extension.name,
                        attrs: { imageID: image.id, ratio: `${image.width} / ${image.height}` }
                    }).run();
                } catch (error) {
                    onError?.(error.message);
                }
            }
        }

        return [
            new Plugin({
                key: new PluginKey('notationImageUpload'),
                props: {
                    handlePaste: (view, event) => {
                        if (!view.editable) return false;

                        const files = imageFiles(event.clipboardData?.files);
                        if (files.length === 0) return false;

                        event.preventDefault();
                        ingest(files, null);

                        return true;
                    },

                    handleDrop: (view, event) => {
                        if (!view.editable) return false;

                        const files = imageFiles(event.dataTransfer?.files);
                        if (files.length === 0) return false;

                        event.preventDefault();

                        const point = view.posAtCoords({ left: event.clientX, top: event.clientY });
                        ingest(files, point?.pos ?? null);

                        return true;
                    }
                }
            })
        ];
    }
});
