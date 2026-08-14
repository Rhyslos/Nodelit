// import modules
import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';

// configuration constants
const SAFE_PROTOCOLS = ['http:', 'https:', 'mailto:'];

// utility functions
function safeHref(value) {
    try {
        const url = new URL(value ?? '', window.location.origin);
        return SAFE_PROTOCOLS.includes(url.protocol) ? url.href : null;
    } catch {
        return null;
    }
}

function anchorFrom(target) {
    return target instanceof Element ? target.closest('a[href]') : null;
}

// extension definition
export const LinkBehaviour = Extension.create({
    name: 'linkBehaviour',

    addProseMirrorPlugins() {
        return [
            new Plugin({
                key: new PluginKey('linkBehaviour'),
                props: {
                    handleDOMEvents: {
                        mousedown: (view, event) => {
                            const anchor = anchorFrom(event.target);
                            if (!anchor) return false;

                            if (view.editable && !(event.metaKey || event.ctrlKey)) return false;

                            event.preventDefault();
                            return true;
                        },
                        click: (view, event) => {
                            const anchor = anchorFrom(event.target);
                            if (!anchor) return false;

                            if (view.editable && !(event.metaKey || event.ctrlKey)) return false;

                            const href = safeHref(anchor.getAttribute('href'));
                            if (!href) return false;

                            event.preventDefault();
                            window.open(href, '_blank', 'noopener,noreferrer');
                            return true;
                        }
                    }
                }
            })
        ];
    }
});
