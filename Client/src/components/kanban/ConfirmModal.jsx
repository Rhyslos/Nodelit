// hook imports
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle } from 'lucide-react';

// ui components
export default function ConfirmModal({
    open,
    title = 'Are you sure?',
    message,
    confirmLabel = 'Delete',
    cancelLabel = 'Cancel',
    destructive = true,
    onConfirm,
    onCancel,
}) {
    // dom references
    const confirmBtnRef = useRef(null);

    // event functions
    useEffect(() => {
        if (!open) return;
        function onKey(e) {
            if (e.key === 'Escape') {
                e.stopPropagation();
                onCancel?.();
            }
        }
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [open, onCancel]);

    // lifecycle functions
    useEffect(() => {
        if (!open) return;
        const id = requestAnimationFrame(() => confirmBtnRef.current?.focus());
        return () => cancelAnimationFrame(id);
    }, [open]);

    if (!open) return null;

    return createPortal(
        <div
            onClick={onCancel}
            style={{
                position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
                backgroundColor: 'rgba(0, 0, 0, 0.5)', display: 'flex',
                justifyContent: 'center', alignItems: 'center', zIndex: 100000,
                backdropFilter: 'blur(2px)', WebkitBackdropFilter: 'blur(2px)',
            }}
        >
            <div
                role="alertdialog"
                aria-modal="true"
                onClick={e => e.stopPropagation()}
                style={{
                    backgroundColor: 'var(--panel, #ffffff)',
                    width: '400px', maxWidth: '90vw',
                    padding: '24px', borderRadius: '12px',
                    border: '1px solid var(--border, #ddd)',
                    boxShadow: '0 10px 30px rgba(0, 0, 0, 0.3)',
                    display: 'flex', flexDirection: 'column', gap: '16px',
                    color: 'var(--ink, #000)',
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    {destructive && (
                        <div
                            style={{
                                width: 36, height: 36, borderRadius: '50%',
                                background: 'rgba(220, 38, 38, 0.12)',
                                color: '#dc2626',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                flexShrink: 0,
                            }}
                        >
                            <AlertTriangle size={18} strokeWidth={2.25} />
                        </div>
                    )}
                    <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>{title}</h3>
                </div>

                {message && (
                    <p style={{ margin: 0, fontSize: '14px', lineHeight: 1.5, color: 'var(--muted, #666)' }}>
                        {message}
                    </p>
                )}

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '4px' }}>
                    <button
                        onClick={onCancel}
                        style={{
                            padding: '8px 16px', borderRadius: '6px',
                            border: '1px solid var(--border, #ddd)',
                            background: 'transparent',
                            color: 'var(--ink, #000)',
                            fontSize: '14px', fontWeight: 500, cursor: 'pointer',
                        }}
                    >
                        {cancelLabel}
                    </button>
                    <button
                        ref={confirmBtnRef}
                        onClick={onConfirm}
                        style={{
                            padding: '8px 16px', borderRadius: '6px',
                            border: 'none',
                            background: destructive ? '#dc2626' : 'var(--accent, #4f46e5)',
                            color: '#fff',
                            fontSize: '14px', fontWeight: 600, cursor: 'pointer',
                            boxShadow: destructive
                                ? '0 1px 3px rgba(220, 38, 38, 0.4)'
                                : '0 1px 3px rgba(0, 0, 0, 0.2)',
                        }}
                    >
                        {confirmLabel}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}