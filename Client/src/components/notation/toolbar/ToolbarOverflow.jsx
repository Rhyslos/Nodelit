// import modules
import { Children, useState, useRef, useEffect, useCallback } from 'react';

// configuration constants
const SECTION_GAP = 14;
const TRIGGER_WIDTH = 44;

// component functions
export default function ToolbarOverflow({ children }) {
    const items = Children.toArray(children);

    // state variables
    const [visible, setVisible] = useState(items.length);
    const [open, setOpen] = useState(false);

    const containerRef = useRef(null);
    const measureRef = useRef(null);
    const triggerRef = useRef(null);

    // layout functions
    const recalculate = useCallback(() => {
        const container = containerRef.current;
        const measure = measureRef.current;

        if (!container || !measure) return;

        const widths = [...measure.children].map(
            child => child.getBoundingClientRect().width + SECTION_GAP
        );

        const available = container.getBoundingClientRect().width;

        let used = 0;
        let count = 0;

        for (const width of widths) {
            if (used + width > available) break;
            used += width;
            count += 1;
        }

        if (count < widths.length) {
            while (count > 0 && used + TRIGGER_WIDTH > available) {
                count -= 1;
                used -= widths[count];
            }
        }

        setVisible(count);
    }, []);

    // lifecycle functions
    useEffect(() => {
        recalculate();

        const observer = new ResizeObserver(recalculate);

        if (containerRef.current) observer.observe(containerRef.current);
        if (measureRef.current) observer.observe(measureRef.current);

        return () => observer.disconnect();
    }, [recalculate, items.length]);

    useEffect(() => {
        if (visible >= items.length) setOpen(false);
    }, [visible, items.length]);

    useEffect(() => {
        if (!open) return undefined;

        function dismiss(event) {
            if (triggerRef.current?.contains(event.target)) return;
            setOpen(false);
        }

        document.addEventListener('mousedown', dismiss);
        return () => document.removeEventListener('mousedown', dismiss);
    }, [open]);

    return (
        <div className="tiptap-toolbar" ref={containerRef}>
            <div className="tiptap-toolbar-measure" ref={measureRef} aria-hidden="true">
                {items.map((item, index) => (
                    <div className="tiptap-toolbar-item" key={`measure-${index}`}>{item}</div>
                ))}
            </div>

            {items.slice(0, visible)}

            {visible < items.length && (
                <div className="tiptap-toolbar-more" ref={triggerRef}>
                    <button
                        className={open ? 'active' : ''}
                        onClick={() => setOpen(current => !current)}
                        title="More tools"
                    >
                        ⋯
                    </button>

                    {open && (
                        <div className="tiptap-toolbar-more-panel">
                            {items.slice(visible)}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
