// package imports
import { useMemo, useState } from 'react';
import { Plus, X } from 'lucide-react';

// configuration constants
const PICKER_RESULTS = 8;
const DUE_SOON_DAYS = 2;

// date functions
function parseDay(value) {
    const [year, month, day] = String(value).split('-').map(Number);
    if (!year || !month || !day) return null;

    return new Date(year, month - 1, day);
}

function startOfDay(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function daysBetween(from, to) {
    return Math.round((to - from) / 86400000);
}

// progress functions
function meterOf(task) {
    const start = parseDay(task.createdOn);
    const end = parseDay(task.deadline);

    if (!start || !end) return null;

    const marker = (task.isCompleted && parseDay(task.completedOn)) || startOfDay(new Date());

    const span = daysBetween(start, end);
    const elapsed = daysBetween(start, marker);
    const ratio = span <= 0 ? 1 : Math.min(Math.max(elapsed / span, 0), 1);

    return { span, elapsed, ratio };
}

function toneOf(task) {
    if (task.isCompleted) return 'completed';
    if (task.daysRemaining < 0) return 'overdue';
    if (task.daysRemaining <= DUE_SOON_DAYS) return 'soon';

    return 'ontrack';
}

function statusOf(task) {
    if (task.isCompleted) return 'Done';
    if (task.daysRemaining === null || task.daysRemaining === undefined) return 'No deadline';
    if (task.daysRemaining < 0) return `${Math.abs(task.daysRemaining)}d late`;
    if (task.daysRemaining === 0) return 'Due today';
    if (task.daysRemaining === 1) return '1d left';

    return `${task.daysRemaining}d left`;
}

// component functions
export default function TrackedTasks({ tracked, tasks, tabByList, canEdit, limit, onAdd, onRemove }) {
    // state variables
    const [picking, setPicking] = useState(false);
    const [term, setTerm] = useState('');
    const [busy, setBusy] = useState(false);

    // data transformations
    const trackedIDs = useMemo(() => new Set(tracked.map(task => task.id)), [tracked]);

    const matches = useMemo(() => {
        const needle = term.trim().toLowerCase();

        return tasks
            .filter(task => !task.isCompleted && !trackedIDs.has(task.id))
            .filter(task => needle === '' || (task.title ?? '').toLowerCase().includes(needle))
            .slice(0, PICKER_RESULTS);
    }, [tasks, trackedIDs, term]);

    const full = tracked.length >= limit;

    // event handlers
    async function handleAdd(taskID) {
        setBusy(true);
        await onAdd(taskID);
        setBusy(false);
        setTerm('');
        setPicking(false);
    }

    async function handleRemove(taskID) {
        setBusy(true);
        await onRemove(taskID);
        setBusy(false);
    }

    // layout structure
    return (
        <>
            {tracked.length === 0 && !picking ? (
                <p className="stat-empty">Nothing tracked yet.</p>
            ) : (
                <ul className="stat-track">
                    {tracked.map(task => {
                        const meter = meterOf(task);
                        const tone = toneOf(task);

                        return (
                            <li className="stat-track-row" key={task.id} data-tone={tone}>
                                <div className="stat-track-head">
                                    <span
                                        className={`stat-track-title ${task.isCompleted ? 'is-done' : ''}`}
                                        title={task.title}
                                    >
                                        {task.title || 'Untitled task'}
                                    </span>

                                    <span
                                        className="stat-track-where"
                                        style={{ '--tab-color': task.tabColor }}
                                        title={task.tabName}
                                    >
                                        {task.tabName}
                                    </span>

                                    {canEdit && (
                                        <button
                                            className="stat-track-drop"
                                            type="button"
                                            disabled={busy}
                                            aria-label={`Stop tracking ${task.title || 'this task'}`}
                                            onClick={() => handleRemove(task.id)}
                                        >
                                            <X size={13} strokeWidth={2.5} />
                                        </button>
                                    )}
                                </div>

                                <div className="stat-track-meter">
                                    {meter ? (
                                        <span
                                            className="stat-track-bar"
                                            title={`${task.createdOn} → ${task.deadline} · day ${meter.elapsed} of ${meter.span}`}
                                        >
                                            <span
                                                className="stat-track-fill"
                                                style={{ width: `${meter.ratio * 100}%` }}
                                            />
                                        </span>
                                    ) : (
                                        <span className="stat-track-bar is-empty" />
                                    )}

                                    <span className="stat-track-status">{statusOf(task)}</span>
                                </div>
                            </li>
                        );
                    })}
                </ul>
            )}

            {picking && (
                <div className="stat-picker">
                    <input
                        className="stat-picker-input"
                        type="text"
                        value={term}
                        autoFocus
                        placeholder="Search open tasks"
                        onChange={event => setTerm(event.target.value)}
                        onKeyDown={event => event.key === 'Escape' && setPicking(false)}
                    />

                    {matches.length === 0 ? (
                        <p className="stat-empty">No open tasks match.</p>
                    ) : (
                        <ul className="stat-picker-list">
                            {matches.map(task => {
                                const tab = tabByList.get(task.listID);

                                return (
                                    <li key={task.id}>
                                        <button
                                            type="button"
                                            disabled={busy}
                                            onClick={() => handleAdd(task.id)}
                                        >
                                            <span className="stat-picker-title">
                                                {task.title || 'Untitled task'}
                                            </span>

                                            <span
                                                className="stat-picker-where"
                                                style={{ '--tab-color': tab?.color }}
                                            >
                                                {tab?.name ?? 'Board'}
                                            </span>
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </div>
            )}

            {canEdit && !picking && (
                <button
                    className="stat-add"
                    type="button"
                    disabled={full}
                    onClick={() => setPicking(true)}
                >
                    <Plus size={14} strokeWidth={2.5} />
                    {full ? `Tracking ${limit} of ${limit}` : 'Track a task'}
                </button>
            )}
        </>
    );
}
