// hook imports
import { useRef, useLayoutEffect } from 'react';

// hook functions
export function useFlipAnimation(deps) {
    // dom references
    const snapshotRects = useRef({});
    const elementsRef = useRef({});
    const pendingAnimation = useRef(false);

    // registration functions
    function registerElement(id, el) {
        if (el) {
            elementsRef.current[id] = el;
        } else if (!pendingAnimation.current) {
            delete elementsRef.current[id];
        }
    }

    // lifecycle functions
    useLayoutEffect(() => {
        if (!pendingAnimation.current) return;

        const elements = elementsRef.current;
        const snap = snapshotRects.current;

        for (const [id, el] of Object.entries(elements)) {
            const prev = snap[id];
            if (!prev) continue;

            const newRect = el.getBoundingClientRect();
            const dx = prev.left - newRect.left;
            const dy = prev.top - newRect.top;

            if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;

            el.style.transition = 'none';
            el.style.transform = `translate(${dx}px, ${dy}px)`;

            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    el.style.transition = 'transform 0.4s cubic-bezier(0.22, 1, 0.36, 1)';
                    el.style.transform = 'translate(0, 0)';

                    el.addEventListener('transitionend', () => {
                        el.style.transition = '';
                        el.style.transform = '';
                    }, { once: true });
                });
            });
        }

        for (const [id, el] of Object.entries(elements)) {
            if (!el.isConnected) {
                delete elementsRef.current[id];
            }
        }

        snapshotRects.current = {};
        pendingAnimation.current = false;
    });

    // state functions
    function snapshot() {
        pendingAnimation.current = true;
        snapshotRects.current = {};
        for (const [id, el] of Object.entries(elementsRef.current)) {
            snapshotRects.current[id] = el.getBoundingClientRect();
        }
    }

    return { registerElement, snapshot };
}