// component imports
import { Mail, CalendarClock } from 'lucide-react';
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

function itemDate(item) {
    if (item.kind !== 'meeting') return dateLabel(item.deadline);

    const start = new Date(item.startsAt);

    return `${start.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })} ${start.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`;
}

function itemWhere(item) {
    if (item.kind === 'meeting') return item.workspaceName;
    return `${item.workspaceName} · ${item.tabName}`;
}

function itemTooltip(item) {
    if (item.kind === 'meeting') {
        return `${item.title || 'Meeting'} — ${itemDate(item)} in ${item.workspaceName}`;
    }

    return `${item.title || 'Untitled task'} — due ${dateLabel(item.deadline)} in ${item.workspaceName} / ${item.tabName}`;
}

function urgencyTone(daysRemaining) {
    if (daysRemaining < 0) return 'is-overdue';
    if (daysRemaining <= 1) return 'is-urgent';

    return '';
}

// component functions
export default function DefaultSubbar({ items = [], itemsLoading = false, onOpenItem }) {
    // derived variables
    const visible = items.slice(0, MAX_VISIBLE);
    const overflow = items.length - visible.length;

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
                {!itemsLoading && visible.map(item => (
                    <button
                        key={`${item.kind}-${item.id}`}
                        type="button"
                        className={`subbar-deadline ${urgencyTone(item.daysRemaining)} ${item.kind === 'meeting' ? 'is-meeting' : ''}`}
                        onClick={() => onOpenItem?.(item)}
                        title={itemTooltip(item)}
                    >
                        <span className="subbar-deadline-head">
                            <span className="subbar-deadline-when">{urgencyLabel(item.daysRemaining)}</span>
                            <span className="subbar-deadline-date">{itemDate(item)}</span>
                        </span>

                        <span className="subbar-deadline-title">
                            {item.kind === 'meeting'
                                ? <CalendarClock size={12} strokeWidth={2} className="subbar-deadline-icon" />
                                : item.isMine && <span className="subbar-deadline-mine" title="Assigned to you" />}
                            {item.title || (item.kind === 'meeting' ? 'Meeting' : 'Untitled task')}
                        </span>

                        <span className="subbar-deadline-where" style={{ '--tab-color': item.tabColor }}>
                            {itemWhere(item)}
                        </span>
                    </button>
                ))}

                {!itemsLoading && overflow > 0 && (
                    <span className="subbar-deadline-more">+{overflow} more</span>
                )}
            </div>
        </Subbar>
    );
}
