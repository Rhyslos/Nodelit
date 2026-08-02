// component imports
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Trash2, Archive } from 'lucide-react';

// configuration constants
const MENU_MARGIN = 8;

// component functions
export default function TabContextMenu({ open, x, y, onArchive, onDelete, onClose }) {
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
        const vw = window.innerWidth;
        const vh = window.innerHeight;

        let nextLeft = x;
        let nextTop = y;

        if (x + rect.width + MENU_MARGIN > vw) nextLeft = vw - rect.width - MENU_MARGIN;
        if (y + rect.height + MENU_MARGIN > vh) nextTop = vh - rect.height - MENU_MARGIN;
        if (nextLeft < MENU_MARGIN) nextLeft = MENU_MARGIN;
        if (nextTop < MENU_MARGIN) nextTop = MENU_MARGIN;

        setPos({ top: nextTop, left: nextLeft });
    }, [open, x, y]);

    // lifecycle functions
    useEffect(() => {
        if (!open) return;

        let attached = false;

        function onDocMouseDown(e) {
            if (menuRef.current && menuRef.current.contains(e.target)) return;
            onClose();
        }

        function onScroll() { onClose(); }
        function onResize() { onClose(); }

        function onKey(e) {
            if (e.key === 'Escape') onClose();
        }

        function onContext(e) {
            if (menuRef.current && menuRef.current.contains(e.target)) return;
            onClose();
        }

        const rafId = requestAnimationFrame(() => {
            document.addEventListener('mousedown', onDocMouseDown);
            document.addEventListener('contextmenu', onContext);
            document.addEventListener('keydown', onKey);
            window.addEventListener('scroll', onScroll, true);
            window.addEventListener('resize', onResize);
            attached = true;
        });

        return () => {
            cancelAnimationFrame(rafId);
            if (!attached) return;

            document.removeEventListener('mousedown', onDocMouseDown);
            document.removeEventListener('contextmenu', onContext);
            document.removeEventListener('keydown', onKey);
            window.removeEventListener('scroll', onScroll, true);
            window.removeEventListener('resize', onResize);
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
            <button className="kanban-context-item" onClick={onArchive}>
                <Archive size={14} strokeWidth={2} />
                Archive tab
            </button>

            <button className="kanban-context-item kanban-context-item--danger" onClick={onDelete}>
                <Trash2 size={14} strokeWidth={2} />
                Delete tab
            </button>
        </div>,
        document.body
    );
}
