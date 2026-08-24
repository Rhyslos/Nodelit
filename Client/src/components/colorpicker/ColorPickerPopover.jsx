// component imports
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import ColorPicker from './ColorPicker';

// configuration constants
const MENU_MARGIN = 8;
const MENU_WIDTH = 288;

// component functions
export default function ColorPickerPopover({ anchorRect, align = 'left', onClose, ...pickerProps }) {
    // dom references
    const ref = useRef(null);

    // state variables
    const [pos, setPos] = useState({ top: 0, left: 0 });

    // layout functions
    useLayoutEffect(() => {
        if (!anchorRect) return;

        const height = ref.current ? ref.current.getBoundingClientRect().height : 0;

        let left = align === 'right' ? anchorRect.right - MENU_WIDTH : anchorRect.left;
        let top = anchorRect.bottom + 6;

        if (left + MENU_WIDTH + MENU_MARGIN > window.innerWidth) {
            left = window.innerWidth - MENU_WIDTH - MENU_MARGIN;
        }

        if (top + height + MENU_MARGIN > window.innerHeight) {
            top = Math.max(MENU_MARGIN, anchorRect.top - height - 6);
        }

        setPos({ top, left: Math.max(MENU_MARGIN, left) });
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
