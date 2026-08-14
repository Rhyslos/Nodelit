// import modules
import { useState, useEffect, useRef } from 'react';

// component functions
export default function ToolbarMenu({ label, title, children }) {
    const [open, setOpen] = useState(false);
    const containerRef = useRef(null);

    // lifecycle functions
    useEffect(() => {
        if (!open) return undefined;

        function dismiss(event) {
            if (containerRef.current?.contains(event.target)) return;
            setOpen(false);
        }

        document.addEventListener('mousedown', dismiss);
        return () => document.removeEventListener('mousedown', dismiss);
    }, [open]);

    return (
        <div className="tiptap-menu" ref={containerRef}>
            <button className={open ? 'active' : ''} onClick={() => setOpen(current => !current)} title={title}>
                {label}
            </button>

            {open && (
                <div className="tiptap-menu-panel" onClick={() => setOpen(false)}>
                    {children}
                </div>
            )}
        </div>
    );
}

export function ToolbarMenuItem({ onSelect, disabled = false, children }) {
    return (
        <button className="tiptap-menu-item" onClick={onSelect} disabled={disabled}>
            {children}
        </button>
    );
}

export function ToolbarMenuDivider() {
    return <div className="tiptap-menu-divider" />;
}
