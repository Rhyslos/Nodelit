// package imports
import { useMemo, useState } from 'react';
import { Plus, X } from 'lucide-react';

// configuration constants
const PICKER_RESULTS = 8;

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
                <ul className="stat-list">
                    {tracked.map(task => (
                        <li className="stat-list-row" key={task.id}>
                            <span className={`stat-list-title ${task.isCompleted ? 'is-done' : ''}`} title={task.title}>
                                {task.title || 'Untitled task'}
                            </span>

                            <span
                                className="stat-list-where"
                                style={{ '--tab-color': task.tabColor }}
                                title={task.tabName}
                            >
                                {task.tabName}
                            </span>

                            {canEdit && (
                                <button
                                    className="stat-list-drop"
                                    type="button"
                                    disabled={busy}
                                    aria-label={`Stop tracking ${task.title || 'this task'}`}
                                    onClick={() => handleRemove(task.id)}
                                >
                                    <X size={13} strokeWidth={2.5} />
                                </button>
                            )}
                        </li>
                    ))}
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
