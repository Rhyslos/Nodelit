// import modules
import { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';

// configuration constants
const EDGE_MARGIN = 8;

// component functions
export default function ContextMenu({ position, onClose, children }) {
    const panelRef = useRef(null);
    const [offset, setOffset] = useState(position);

    // layout functions
    useLayoutEffect(() => {
        const panel = panelRef.current;
        if (!panel) return;

        const rect = panel.getBoundingClientRect();
        const maxLeft = window.innerWidth - rect.width - EDGE_MARGIN;
        const maxTop = window.innerHeight - rect.height - EDGE_MARGIN;

        setOffset({
            x: Math.max(EDGE_MARGIN, Math.min(position.x, maxLeft)),
            y: Math.max(EDGE_MARGIN, Math.min(position.y, maxTop))
        });
    }, [position]);

    // lifecycle functions
    useEffect(() => {
        function dismiss(event) {
            if (panelRef.current?.contains(event.target)) return;
            onClose();
        }

        function dismissKey(event) {
            if (event.key === 'Escape') onClose();
        }

        document.addEventListener('mousedown', dismiss);
        document.addEventListener('keydown', dismissKey);
        window.addEventListener('scroll', onClose, true);
        window.addEventListener('resize', onClose);
        window.addEventListener('blur', onClose);

        return () => {
            document.removeEventListener('mousedown', dismiss);
            document.removeEventListener('keydown', dismissKey);
            window.removeEventListener('scroll', onClose, true);
            window.removeEventListener('resize', onClose);
            window.removeEventListener('blur', onClose);
        };
    }, [onClose]);

    return createPortal(
        <div
            ref={panelRef}
            className="notation-context-menu"
            style={{ top: offset.y, left: offset.x }}
            onContextMenu={event => event.preventDefault()}
        >
            {children}
        </div>,
        document.body
    );
}

export function ContextMenuItem({ onSelect, disabled = false, danger = false, children }) {
    return (
        <button
            className={`notation-context-item ${danger ? 'danger' : ''}`}
            disabled={disabled}
            onClick={onSelect}
        >
            {children}
        </button>
    );
}

export function ContextMenuDivider() {
    return <div className="notation-context-divider" />;
}

export function ContextMenuLabel({ children }) {
    return <div className="notation-context-label">{children}</div>;
}
