// component imports
import { Mail } from 'lucide-react';
import Subbar from './Subbar';

// configuration constants
const MAX_VISIBLE = 8;

// utility functions
function parseDeadline(value) {
    const [year, month, day] = String(value).split('-').map(Number);
    if (!year || !month || !day) return null;

    return new Date(year, month - 1, day);
}

function urgencyLabel(daysRemaining) {
    if (daysRemaining < 0) return `${Math.abs(daysRemaining)}d late`;
    if (daysRemaining === 0) return 'Today';
    if (daysRemaining === 1) return 'Tomorrow';

    return `in ${daysRemaining}d`;
}

function dateLabel(value) {
    const date = parseDeadline(value);
    if (!date) return '';

    return date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}

function urgencyTone(daysRemaining) {
    if (daysRemaining < 0) return 'is-overdue';
    if (daysRemaining <= 1) return 'is-urgent';

    return '';
}

// component functions
export default function DefaultSubbar({ deadlines = [], deadlinesLoading = false, onOpenDeadline }) {
    // derived variables
    const visible = deadlines.slice(0, MAX_VISIBLE);
    const overflow = deadlines.length - visible.length;

    return (
        <Subbar>
            <button
                type="button"
                className="subbar-notify-btn"
                title="Notifications"
                aria-label="Notifications"
            >
                <Mail size={18} strokeWidth={2} />
            </button>

            <span className="subbar-divider" />

            <div className="subbar-content">
                {!deadlinesLoading && visible.map(item => (
                    <button
                        key={item.id}
                        type="button"
                        className={`subbar-deadline ${urgencyTone(item.daysRemaining)}`}
                        onClick={() => onOpenDeadline?.(item)}
                        title={`${item.title || 'Untitled task'} — due ${dateLabel(item.deadline)} in ${item.workspaceName} / ${item.tabName}`}
                    >
                        <span className="subbar-deadline-head">
                            <span className="subbar-deadline-when">{urgencyLabel(item.daysRemaining)}</span>
                            <span className="subbar-deadline-date">{dateLabel(item.deadline)}</span>
                        </span>

                        <span className="subbar-deadline-title">
                            {item.isMine && <span className="subbar-deadline-mine" title="Assigned to you" />}
                            {item.title || 'Untitled task'}
                        </span>

                        <span className="subbar-deadline-where" style={{ '--tab-color': item.tabColor }}>
                            {item.workspaceName} · {item.tabName}
                        </span>
                    </button>
                ))}

                {!deadlinesLoading && overflow > 0 && (
                    <span className="subbar-deadline-more">+{overflow} more</span>
                )}
            </div>
        </Subbar>
    );
}
