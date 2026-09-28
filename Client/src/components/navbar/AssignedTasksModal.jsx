// component imports
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { api } from '../../lib/api';
import { useStream } from '../../contexts/StreamContext';

// date functions
function daysUntil(deadline) {
    const [year, month, day] = deadline.split('-').map(Number);
    if (!year || !month || !day) return null;

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const due = new Date(year, month - 1, day);

    return Math.round((due - today) / 86400000);
}

// formatting functions
function whenLabel(days) {
    if (days < 0) return `${Math.abs(days)}d late`;
    if (days === 0) return 'Today';
    if (days === 1) return 'Tomorrow';

    return `in ${days}d`;
}

function whenTone(days) {
    if (days < 0) return 'overdue';
    if (days <= 1) return 'today';

    return 'soon';
}

function byDeadline(a, b) {
    if (a.days === null && b.days === null) return a.taskOrder - b.taskOrder;
    if (a.days === null) return 1;
    if (b.days === null) return -1;

    return a.days - b.days || a.taskOrder - b.taskOrder;
}

// grouping functions
function groupAssigned(board, userID) {
    const tabs = new Map(board.tabs.filter(tab => !tab.isArchived).map(tab => [tab.id, tab]));
    const lists = new Map(board.lists.map(list => [list.id, list]));
    const groups = new Map();

    for (const task of board.tasks) {
        if (!task.assignedUsers?.includes(userID)) continue;

        const list = lists.get(task.listID);
        const tab = list ? tabs.get(list.tabID) : null;
        if (!tab) continue;

        if (!groups.has(tab.id)) groups.set(tab.id, { tab, open: [], completed: [] });

        const entry = {
            ...task,
            listName: list.name,
            days: task.deadline ? daysUntil(task.deadline) : null
        };

        groups.get(tab.id)[task.isCompleted ? 'completed' : 'open'].push(entry);
    }

    return [...groups.values()]
        .map(group => ({ ...group, open: group.open.sort(byDeadline) }))
        .sort((a, b) => a.tab.tabOrder - b.tab.tabOrder);
}

// component functions
export default function AssignedTasksModal({ workspaceID, member, onClose }) {
    const navigate = useNavigate();
    const { subscribe } = useStream();

    // state variables
    const [board, setBoard] = useState(null);
    const [error, setError] = useState('');
    const [showCompleted, setShowCompleted] = useState(false);

    // lifecycle functions
    useEffect(() => {
        const controller = new AbortController();

        function fetchBoard() {
            api(`/api/kanban/${workspaceID}`, { signal: controller.signal })
                .then(data => {
                    setBoard(data);
                    setError('');
                })
                .catch(err => {
                    if (err?.name === 'AbortError') return;
                    setError('The tasks could not be loaded.');
                });
        }

        fetchBoard();
        const stopKanban = subscribe('kanban', fetchBoard);

        return () => {
            controller.abort();
            stopKanban();
        };
    }, [workspaceID, subscribe]);

    useEffect(() => {
        function onKey(event) {
            if (event.key === 'Escape') onClose();
        }

        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [onClose]);

    // derived variables
    const groups = useMemo(() => (board ? groupAssigned(board, member.id) : []), [board, member.id]);

    const openCount = groups.reduce((sum, group) => sum + group.open.length, 0);
    const lateCount = groups.reduce((sum, group) => sum + group.open.filter(task => task.days !== null && task.days < 0).length, 0);
    const completedCount = groups.reduce((sum, group) => sum + group.completed.length, 0);

    // navigation handlers
    function openTab(tabID) {
        navigate(`/workspace/${workspaceID}/kanban?tab=${tabID}`);
        onClose();
    }

    return createPortal(
        <div className="modal-overlay" onClick={onClose}>
            <div
                className="modal assigned-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="assigned-title"
                onClick={event => event.stopPropagation()}
            >
                <div className="assigned-head">
                    <span className="assigned-dot" style={{ background: member.cursorColor ?? 'var(--muted)' }} />
                    <div className="assigned-identity">
                        <h2 className="assigned-title" id="assigned-title">{member.displayName}</h2>
                        {board && (
                            <p className="assigned-summary">
                                {openCount} open
                                {lateCount > 0 && <span className="assigned-late"> · {lateCount} late</span>}
                                {completedCount > 0 && ` · ${completedCount} done`}
                            </p>
                        )}
                    </div>
                </div>

                <div className="assigned-body">
                    {error && <p className="modal-error">{error}</p>}

                    {!board && !error && <p className="assigned-empty">Loading…</p>}

                    {board && openCount === 0 && completedCount === 0 && (
                        <p className="assigned-empty">No tasks are assigned to {member.displayName}.</p>
                    )}

                    {board && openCount === 0 && completedCount > 0 && (
                        <p className="assigned-empty">Everything assigned to {member.displayName} is done.</p>
                    )}

                    {groups.filter(group => group.open.length > 0).map(group => (
                        <section className="assigned-group" key={group.tab.id}>
                            <button
                                type="button"
                                className="assigned-tab"
                                style={{ '--tab-color': group.tab.color }}
                                onClick={() => openTab(group.tab.id)}
                            >
                                {group.tab.name}
                                <ChevronRight size={13} strokeWidth={2} />
                            </button>

                            <ul className="assigned-list">
                                {group.open.map(task => (
                                    <li key={task.id}>
                                        <button type="button" className="assigned-row" onClick={() => openTab(group.tab.id)}>
                                            <span className="assigned-row-title" title={task.title}>
                                                {task.title || 'Untitled task'}
                                            </span>
                                            <span className="assigned-row-list">{task.listName}</span>
                                            {task.days !== null && (
                                                <span className={`stat-list-when is-${whenTone(task.days)}`}>
                                                    {whenLabel(task.days)}
                                                </span>
                                            )}
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        </section>
                    ))}

                    {completedCount > 0 && (
                        <section className="assigned-group">
                            <button
                                type="button"
                                className="assigned-toggle"
                                aria-expanded={showCompleted}
                                onClick={() => setShowCompleted(current => !current)}
                            >
                                <ChevronRight size={13} strokeWidth={2} className={showCompleted ? 'is-open' : ''} />
                                Completed ({completedCount})
                            </button>

                            {showCompleted && (
                                <ul className="assigned-list">
                                    {groups.flatMap(group => group.completed.map(task => (
                                        <li key={task.id}>
                                            <button
                                                type="button"
                                                className="assigned-row is-completed"
                                                onClick={() => openTab(group.tab.id)}
                                            >
                                                <span className="assigned-row-title" title={task.title}>
                                                    {task.title || 'Untitled task'}
                                                </span>
                                                <span className="assigned-row-list">{group.tab.name}</span>
                                            </button>
                                        </li>
                                    )))}
                                </ul>
                            )}
                        </section>
                    )}
                </div>

                <div className="modal-actions">
                    <button className="modal-cancel" onClick={onClose}>Close</button>
                </div>
            </div>
        </div>,
        document.body
    );
}
