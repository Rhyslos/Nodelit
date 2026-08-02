// component imports
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle } from 'lucide-react';

// component functions
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

    // lifecycle functions
    useEffect(() => {
        if (!open) return;

        function onKey(e) {
            if (e.key !== 'Escape') return;
            e.stopPropagation();
            onCancel?.();
        }

        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [open, onCancel]);

    useEffect(() => {
        if (!open) return;

        const id = requestAnimationFrame(() => confirmBtnRef.current?.focus());
        return () => cancelAnimationFrame(id);
    }, [open]);

    if (!open) return null;

    return createPortal(
        <div className="kanban-modal-overlay" onClick={onCancel}>
            <div
                className="kanban-modal kanban-modal--confirm"
                role="alertdialog"
                aria-modal="true"
                onClick={e => e.stopPropagation()}
            >
                <div className="kanban-confirm-head">
                    {destructive && (
                        <div className="kanban-confirm-icon">
                            <AlertTriangle size={18} strokeWidth={2.25} />
                        </div>
                    )}
                    <h3 className="kanban-confirm-title">{title}</h3>
                </div>

                {message && <p className="kanban-confirm-message">{message}</p>}

                <div className="kanban-modal-actions">
                    <button className="kanban-modal-cancel" onClick={onCancel}>
                        {cancelLabel}
                    </button>
                    <button
                        ref={confirmBtnRef}
                        className={`kanban-modal-submit ${destructive ? 'is-destructive' : ''}`}
                        onClick={onConfirm}
                    >
                        {confirmLabel}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}
