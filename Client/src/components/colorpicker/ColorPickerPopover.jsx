// component imports
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import ColorPicker from './ColorPicker';

// configuration constants
const MENU_MARGIN = 8;
const FALLBACK_WIDTH = 288;

// component functions
export default function ColorPickerPopover({ anchorRect, align = 'left', onClose, ...pickerProps }) {
    // dom references
    const ref = useRef(null);

    // state variables
    const [pos, setPos] = useState({ top: 0, left: 0 });

    // layout functions
    function place() {
        if (!anchorRect) return;

        const rect = ref.current ? ref.current.getBoundingClientRect() : null;
        const height = rect ? rect.height : 0;
        const width = rect && rect.width > 0 ? rect.width : FALLBACK_WIDTH;

        let left = align === 'right' ? anchorRect.right - width : anchorRect.left;
        let top = anchorRect.bottom + 6;

        if (left + width + MENU_MARGIN > window.innerWidth) {
            left = window.innerWidth - width - MENU_MARGIN;
        }

        if (top + height + MENU_MARGIN > window.innerHeight) {
            top = Math.max(MENU_MARGIN, anchorRect.top - height - 6);
        }

        setPos({ top, left: Math.max(MENU_MARGIN, left) });
    }

    useLayoutEffect(() => {
        place();

        const element = ref.current;
        if (!element || typeof ResizeObserver === 'undefined') return;

        const observer = new ResizeObserver(() => place());
        observer.observe(element);

        return () => observer.disconnect();
    }, [anchorRect, align]);

    // lifecycle functions
    useEffect(() => {
        function handlePointerDown(event) {
            if (ref.current && ref.current.contains(event.target)) return;
            onClose();
        }

        function handleKey(event) {
            if (event.key === 'Escape') onClose();
        }

        const frame = requestAnimationFrame(() => {
            document.addEventListener('mousedown', handlePointerDown);
            document.addEventListener('keydown', handleKey);
            window.addEventListener('resize', onClose);
        });

        return () => {
            cancelAnimationFrame(frame);
            document.removeEventListener('mousedown', handlePointerDown);
            document.removeEventListener('keydown', handleKey);
            window.removeEventListener('resize', onClose);
        };
    }, [onClose]);

    return createPortal(
        <div
            ref={ref}
            className="color-picker-popover"
            style={{ top: pos.top, left: pos.left }}
            onMouseDown={event => event.stopPropagation()}
        >
            <ColorPicker {...pickerProps} />
        </div>,
        document.body
    );
}