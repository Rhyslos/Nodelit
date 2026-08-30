// component imports
import { createPortal } from 'react-dom';
import { AlertTriangle, Info, X, XCircle } from 'lucide-react';
import { useToast } from '../../contexts/ToastContext';

// configuration constants
const ICONS = {
    info: Info,
    warning: AlertTriangle,
    danger: XCircle
};

// component functions
export default function ToastStack() {
    const { toasts, dismiss } = useToast();

    if (toasts.length === 0) return null;

    return createPortal(
        <div className="toast-stack" role="status" aria-live="polite">
            {toasts.map(toast => {
                const Icon = ICONS[toast.tone] ?? Info;

                return (
                    <div className={`toast toast--${toast.tone}`} key={toast.id}>
                        <span className="toast-icon">
                            <Icon size={15} strokeWidth={2} />
                        </span>

                        <span className="toast-body">
                            <span className="toast-title">{toast.title}</span>
                            {toast.detail && <span className="toast-detail">{toast.detail}</span>}
                        </span>

                        <button
                            type="button"
                            className="toast-close"
                            title="Dismiss"
                            aria-label="Dismiss"
                            onClick={() => dismiss(toast.id)}
                        >
                            <X size={13} strokeWidth={2.5} />
                        </button>
                    </div>
                );
            })}
        </div>,
        document.body
    );
}
