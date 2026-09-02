// component imports
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

// configuration constants
const MENU_MARGIN = 8;

// component functions
export default function BoardContextMenu({ open, x, y, heading, items, onClose }) {
    // dom references
    const menuRef = useRef(null);

    // state variables
    const [pos, setPos] = useState({ top: y, left: x });

    // layout functions
    useLayoutEffect(() => {
        if (!open) return;

        const el = menuRef.current;
        if (!el) return;

        const rect = el.getBoundingClientRect();

        let nextLeft = x;
        let nextTop = y;

        if (x + rect.width + MENU_MARGIN > window.innerWidth) nextLeft = window.innerWidth - rect.width - MENU_MARGIN;
        if (y + rect.height + MENU_MARGIN > window.innerHeight) nextTop = window.innerHeight - rect.height - MENU_MARGIN;
        if (nextLeft < MENU_MARGIN) nextLeft = MENU_MARGIN;
        if (nextTop < MENU_MARGIN) nextTop = MENU_MARGIN;

        setPos({ top: nextTop, left: nextLeft });
    }, [open, x, y]);

    // lifecycle functions
    useEffect(() => {
        if (!open) return;

        function onPointerDown(e) {
            if (menuRef.current && menuRef.current.contains(e.target)) return;
            onClose();
        }

        function onKey(e) {
            if (e.key === 'Escape') onClose();
        }

        function onScroll(e) {
            if (menuRef.current && e.target instanceof Node && menuRef.current.contains(e.target)) return;
            onClose();
        }

        const frame = requestAnimationFrame(() => {
            document.addEventListener('mousedown', onPointerDown);
            document.addEventListener('keydown', onKey);
            window.addEventListener('scroll', onScroll, true);
            window.addEventListener('resize', onClose);
        });

        return () => {
            cancelAnimationFrame(frame);
            document.removeEventListener('mousedown', onPointerDown);
            document.removeEventListener('keydown', onKey);
            window.removeEventListener('scroll', onScroll, true);
            window.removeEventListener('resize', onClose);
        };
    }, [open, onClose]);

    if (!open) return null;

    return createPortal(
        <div
            ref={menuRef}
            className="kanban-context-menu"
            style={{ top: pos.top, left: pos.left }}
            onMouseDown={e => e.stopPropagation()}
            onContextMenu={e => e.preventDefault()}
        >
            {heading && <span className="kanban-context-heading" title={heading}>{heading}</span>}

            {items.map(item => item.separator ? (
                <span className="kanban-context-separator" key={item.key} />
            ) : (
                <button
                    key={item.key}
                    type="button"
                    className={`kanban-context-item ${item.danger ? 'kanban-context-item--danger' : ''}`}
                    disabled={item.disabled}
                    onClick={() => {
                        onClose();
                        item.onSelect();
                    }}
                >
                    {item.icon}
                    {item.label}
                </button>
            ))}
        </div>,
        document.body
    );
}
