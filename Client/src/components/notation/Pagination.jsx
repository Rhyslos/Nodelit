// import modules
import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

// configuration constants
const paginationKey = new PluginKey('pagination');
const PAGE_HEIGHT = 1123;
const PAGE_MARGIN = 96;
const PAGE_GAP = 24;

// utility functions
function outerHeight(element) {
    const style = window.getComputedStyle(element);

    return element.offsetHeight
        + (Number.parseFloat(style.marginTop) || 0)
        + (Number.parseFloat(style.marginBottom) || 0);
}

function measureBreaks(view) {
    const usable = PAGE_HEIGHT - PAGE_MARGIN * 2;
    const breaks = [];

    let used = 0;

    view.state.doc.forEach((node, offset) => {
        const dom = view.nodeDOM(offset);
        if (!(dom instanceof HTMLElement)) return;

        if (node.type.name === 'pageBreak') {
            breaks.push({ pos: offset, fill: Math.max(0, usable - used) });
            used = 0;
            return;
        }

        const height = outerHeight(dom);

        if (used > 0 && used + height > usable) {
            breaks.push({ pos: offset, fill: Math.max(0, usable - used) });
            used = height;
            return;
        }

        used += height;
    });

    return breaks;
}

function spacerElement(fill) {
    const element = document.createElement('div');

    element.className = 'notation-page-spacer';
    element.contentEditable = 'false';
    element.style.setProperty('--fill', `${fill}px`);
    element.style.setProperty('--gap', `${PAGE_GAP}px`);
    element.style.setProperty('--edge', `${PAGE_MARGIN}px`);
    element.style.height = `${fill + PAGE_GAP + PAGE_MARGIN * 2}px`;

    return element;
}

function buildDecorations(view, breaks) {
    return DecorationSet.create(
        view.state.doc,
        breaks.map(entry => Decoration.widget(entry.pos, () => spacerElement(entry.fill), {
            side: -1,
            ignoreSelection: true,
            key: `page:${entry.pos}:${Math.round(entry.fill)}`
        }))
    );
}

function signature(breaks) {
    return breaks.map(entry => `${entry.pos}:${Math.round(entry.fill)}`).join('|');
}

// extension definition
export const Pagination = Extension.create({
    name: 'pagination',

    addStorage() {
        return { enabled: false };
    },

    addProseMirrorPlugins() {
        const extension = this;

        return [
            new Plugin({
                key: paginationKey,

                state: {
                    init() {
                        return { decorations: DecorationSet.empty, signature: '' };
                    },

                    apply(transaction, value) {
                        const next = transaction.getMeta(paginationKey);
                        if (next) return next;

                        return {
                            decorations: value.decorations.map(transaction.mapping, transaction.doc),
                            signature: value.signature
                        };
                    }
                },

                props: {
                    decorations(state) {
                        return paginationKey.getState(state).decorations;
                    }
                },

                view(editorView) {
                    let frame = null;

                    function recalculate() {
                        frame = null;

                        const current = paginationKey.getState(editorView.state);

                        if (!extension.storage.enabled) {
                            if (current.signature === '') return;

                            editorView.dispatch(
                                editorView.state.tr.setMeta(paginationKey, {
                                    decorations: DecorationSet.empty,
                                    signature: ''
                                })
                            );

                            return;
                        }

                        const breaks = measureBreaks(editorView);
                        const next = signature(breaks);

                        if (next === current.signature) return;

                        editorView.dispatch(
                            editorView.state.tr.setMeta(paginationKey, {
                                decorations: buildDecorations(editorView, breaks),
                                signature: next
                            })
                        );
                    }

                    function schedule() {
                        if (frame) return;
                        frame = requestAnimationFrame(recalculate);
                    }

                    const observer = new ResizeObserver(schedule);
                    observer.observe(editorView.dom);

                    schedule();

                    return {
                        update: schedule,
                        destroy() {
                            observer.disconnect();
                            if (frame) cancelAnimationFrame(frame);
                        }
                    };
                }
            })
        ];
    }
});
