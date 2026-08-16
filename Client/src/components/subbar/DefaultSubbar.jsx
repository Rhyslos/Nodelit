// component imports
import { useState } from 'react';
import Subbar from './Subbar';

// configuration constants
const MAX_VISIBLE = 5;

const SECTIONS = [
    { key: 'recent', label: 'Recent', placeholder: 'No recent workspaces' },
    { key: 'deadlines', label: 'Deadlines', placeholder: 'No upcoming deadlines' },
    { key: 'activity', label: 'Activity', placeholder: 'No recent activity' }
];

// utility functions
function deadlineLabel(daysRemaining) {
    if (daysRemaining < 0) return `${Math.abs(daysRemaining)}d late`;
    if (daysRemaining === 0) return 'Today';
    if (daysRemaining === 1) return 'Tomorrow';
    return `${daysRemaining}d`;
}

function deadlineTone(daysRemaining) {
    if (daysRemaining < 0) return 'is-overdue';
    if (daysRemaining <= 1) return 'is-urgent';
    return '';
}

// component functions
export default function DefaultSubbar({ deadlines = [], deadlinesLoading = false, onOpenWorkspace }) {
    // state variables
    const [expanded, setExpanded] = useState(false);

    // render functions
    function renderDeadlines() {
        if (deadlinesLoading) {
            return <div className="subbar-placeholder">Loading…</div>;
        }

        if (deadlines.length === 0) {
            return <div className="subbar-placeholder">Nothing due in the next 7 days</div>;
        }

        return (
            <div className="subbar-deadline-list">
                {deadlines.slice(0, MAX_VISIBLE).map(item => (
                    <button
                        key={item.id}
                        className={`subbar-deadline ${deadlineTone(item.daysRemaining)}`}
                        onClick={() => onOpenWorkspace?.(item.workspaceID)}
                        title={`${item.title || 'Untitled task'} — due ${item.deadline} in ${item.workspaceName} / ${item.tabName}`}
                    >
                        <span className="subbar-deadline-when">{deadlineLabel(item.daysRemaining)}</span>

                        <span className="subbar-deadline-title">
                            {item.isMine && <span className="subbar-deadline-mine" title="Assigned to you" />}
                            {item.title || 'Untitled task'}
                        </span>

                        <span className="subbar-deadline-where" style={{ '--tab-color': item.tabColor }}>
                            {item.workspaceName}
                        </span>
                    </button>
                ))}

                {deadlines.length > MAX_VISIBLE && (
                    <span className="subbar-deadline-more">
                        +{deadlines.length - MAX_VISIBLE} more
                    </span>
                )}
            </div>
        );
    }

    function renderSection(section) {
        if (section.key === 'deadlines') return renderDeadlines();
        return <div className="subbar-placeholder">{section.placeholder}</div>;
    }

    return (
        <Subbar>
            {SECTIONS.map(section => (
                <div className="subbar-section" key={section.key}>
                    <span className="subbar-label">{section.label}</span>
                    {renderSection(section)}
                </div>
            ))}

            <button className="subbar-collapse-btn" onClick={() => setExpanded(open => !open)}>
                {expanded ? '▲ Hide' : '☰ Overview'}
            </button>

            {expanded && (
                <div className="subbar-collapsed-dropdown">
                    {SECTIONS.map(section => (
                        <div className="subbar-collapsed-section" key={section.key}>
                            <span className="subbar-label">{section.label}</span>
                            {renderSection(section)}
                        </div>
                    ))}
                </div>
            )}
        </Subbar>
    );
}
