// component imports
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check } from 'lucide-react';

// configuration constants
const MENU_MARGIN = 8;
const MENU_WIDTH = 210;

// component functions
export default function TagPicker({ anchorRect, tags, selected = [], onToggle, onClose }) {
    // dom references
    const ref = useRef(null);

    // state variables
    const [pos, setPos] = useState({ top: 0, left: 0 });

    // layout functions
    useLayoutEffect(() => {
        if (!anchorRect) return;

        const height = ref.current ? ref.current.getBoundingClientRect().height : 0;

        let left = anchorRect.left;
        let top = anchorRect.bottom + 6;

        if (left + MENU_WIDTH + MENU_MARGIN > window.innerWidth) {
            left = window.innerWidth - MENU_WIDTH - MENU_MARGIN;
        }

        if (top + height + MENU_MARGIN > window.innerHeight) {
            top = Math.max(MENU_MARGIN, anchorRect.top - height - 6);
        }

        setPos({ top, left: Math.max(MENU_MARGIN, left) });
    }, [anchorRect]);

    // lifecycle functions
    useEffect(() => {
        function handlePointerDown(e) {
            if (ref.current && ref.current.contains(e.target)) return;
            onClose();
        }

        function handleKey(e) {
            if (e.key === 'Escape') onClose();
        }

        const frame = requestAnimationFrame(() => {
            document.addEventListener('mousedown', handlePointerDown);
            document.addEventListener('keydown', handleKey);
            window.addEventListener('scroll', onClose, true);
            window.addEventListener('resize', onClose);
        });

        return () => {
            cancelAnimationFrame(frame);
            document.removeEventListener('mousedown', handlePointerDown);
            document.removeEventListener('keydown', handleKey);
            window.removeEventListener('scroll', onClose, true);
            window.removeEventListener('resize', onClose);
        };
    }, [onClose]);

    return createPortal(
        <div
            ref={ref}
            className="tag-picker"
            style={{ top: pos.top, left: pos.left, width: MENU_WIDTH }}
            onMouseDown={e => e.stopPropagation()}
            onClick={e => e.stopPropagation()}
        >
            <div className="tag-picker-list">
                {tags.map(tag => (
                    <button
                        key={tag.id}
                        type="button"
                        className={`tag-picker-item ${selected.includes(tag.id) ? 'active' : ''}`}
                        onClick={() => onToggle(tag.id)}
                    >
                        <span className="tag-picker-swatch" style={{ background: tag.color }} />
                        <span className="tag-picker-name">{tag.name}</span>
                        {selected.includes(tag.id) && <Check size={13} strokeWidth={2.5} />}
                    </button>
                ))}

                {tags.length === 0 && (
                    <p className="tag-picker-empty">No tags yet. Create one from the navbar.</p>
                )}
            </div>
        </div>,
        document.body
    );
}
