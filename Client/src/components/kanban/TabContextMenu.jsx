// hook imports
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Trash2 } from 'lucide-react';

// state variables
const MENU_MARGIN = 8;

// ui components
export default function TabContextMenu({ open, x, y, onDelete, onClose }) {
    // dom references
    const menuRef = useRef(null);
    
    // state variables
    const [pos, setPos] = useState({ top: y, left: x });

    // lifecycle functions
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
            if (attached) {
                document.removeEventListener('mousedown', onDocMouseDown);
                document.removeEventListener('contextmenu', onContext);
                document.removeEventListener('keydown', onKey);
                window.removeEventListener('scroll', onScroll, true);
                window.removeEventListener('resize', onResize);
            }
        };
    }, [open, onClose]);

    if (!open) return null;

    return createPortal(
        <div
            ref={menuRef}
            onMouseDown={e => e.stopPropagation()}
            onContextMenu={e => e.preventDefault()}
            style={{
                position: 'fixed',
                top: pos.top,
                left: pos.left,
                minWidth: 160,
                padding: 4,
                background: 'var(--panel, #ffffff)',
                border: '1px solid var(--border, #ddd)',
                borderRadius: 8,
                boxShadow: '0 8px 24px rgba(0, 0, 0, 0.18)',
                zIndex: 10000,
                userSelect: 'none',
                fontSize: 13,
            }}
        >
            <button
                onClick={onDelete}
                style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '8px 10px',
                    background: 'transparent',
                    border: 'none',
                    borderRadius: 6,
                    color: '#dc2626',
                    fontSize: 13,
                    fontWeight: 500,
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'background 100ms ease',
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(220, 38, 38, 0.08)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
                <Trash2 size={14} strokeWidth={2} />
                Delete tab
            </button>
        </div>,
        document.body
    );
}