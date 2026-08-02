// component imports
import { useRef, useLayoutEffect } from 'react';

// configuration constants
const EASE = 'cubic-bezier(0.32, 0.72, 0, 1)';

// component functions
export default function AnimatedRemoval({ removing, duration = 250, children }) {
    // dom references
    const wrapperRef = useRef(null);

    // lifecycle functions
    useLayoutEffect(() => {
        const el = wrapperRef.current;
        if (!el) return;

        if (!removing) {
            el.style.cssText = '';
            return;
        }

        el.style.height = `${el.scrollHeight}px`;
        el.style.overflow = 'hidden';

        const outer = requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                el.style.transition = [
                    `height ${duration}ms ${EASE}`,
                    `opacity ${duration * 0.7}ms ${EASE}`,
                    `transform ${duration}ms ${EASE}`,
                    `margin ${duration}ms ${EASE}`
                ].join(', ');

                el.style.height = '0px';
                el.style.opacity = '0';
                el.style.transform = 'scale(0.95)';
                el.style.marginTop = '0px';
                el.style.marginBottom = '0px';
            });
        });

        return () => cancelAnimationFrame(outer);
    }, [removing, duration]);

    return (
        <div ref={wrapperRef} className="animated-removal">
            {children}
        </div>
    );
}
