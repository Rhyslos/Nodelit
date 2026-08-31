// component imports
import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { UserPlus, Tag as TagIcon } from 'lucide-react';
import AssigneeDropdown from './AssigneeDropdown';
import TagPicker from './TagPicker';

// configuration constants
const SAVE_DELAY = 600;

// utility functions
function toDraft(task) {
    return {
        title: task?.title ?? '',
        description: task?.description ?? '',
        isCompleted: !!task?.isCompleted,
        deadline: task?.deadline ?? '',
        checklists: task?.checklists ?? [],
        assignedUsers: task?.assignedUsers ?? []
    };
}

// component functions
export default function TaskModal({ task, tags = [], members = [], onChange, onSetTags, onClose }) {
    const taskID = task?.id ?? null;

    // state variables
    const [draft, setDraft] = useState(() => toDraft(task));
    const [status, setStatus] = useState('idle');
    const [assignRect, setAssignRect] = useState(null);
    const [tagRect, setTagRect] = useState(null);

    // dom references
    const assignBtnRef = useRef(null);
    const tagBtnRef = useRef(null);

    // save references
    const draftRef = useRef(draft);
    const timer = useRef(null);
    const dirty = useRef(false);
    const saving = useRef(false);
    const queued = useRef(false);
    const flushRef = useRef(null);

    // save functions
    const flush = useCallback(async () => {
        if (timer.current) {
            clearTimeout(timer.current);
            timer.current = null;
        }

        if (!dirty.current) return;

        if (saving.current) {
            queued.current = true;
            return;
        }

        dirty.current = false;
        saving.current = true;
        setStatus('saving');

        const payload = draftRef.current;

        try {
            await onChange({
                ...payload,
                title: payload.title.trim() === '' ? 'New Task' : payload.title
            });
        } finally {
            saving.current = false;
            setStatus('saved');

            if (queued.current) {
                queued.current = false;
                flushRef.current?.();
            }
        }
    }, [onChange]);

    flushRef.current = flush;

    const schedule = useCallback(immediate => {
        dirty.current = true;

        if (timer.current) clearTimeout(timer.current);

        if (immediate) {
            flushRef.current?.();
            return;
        }

        timer.current = setTimeout(() => flushRef.current?.(), SAVE_DELAY);
    }, []);

    const apply = useCallback((patch, immediate = false) => {
        const next = { ...draftRef.current, ...patch };

        draftRef.current = next;
        setDraft(next);
        schedule(immediate);
    }, [schedule]);

    // lifecycle functions
    useEffect(() => {
        const next = toDraft(task);

        draftRef.current = next;
        dirty.current = false;
        setDraft(next);
        setStatus('idle');

        if (timer.current) {
            clearTimeout(timer.current);
            timer.current = null;
        }
    }, [taskID]);

    useEffect(() => {
        return () => {
            if (timer.current) clearTimeout(timer.current);
            flushRef.current?.();
        };
    }, []);

    // mutation functions
    function addChecklist() {
        apply({
            checklists: [...draftRef.current.checklists, { id: crypto.randomUUID(), name: 'Checklist', items: [] }]
        }, true);
    }

    function updateChecklistAt(index, patch, immediate = false) {
        apply({
            checklists: draftRef.current.checklists.map((list, i) => i === index ? { ...list, ...patch } : list)
        }, immediate);
    }

    function removeChecklistAt(index) {
        apply({
            checklists: draftRef.current.checklists.filter((_, i) => i !== index)
        }, true);
    }

    function addItem(listIndex) {
        apply({
            checklists: draftRef.current.checklists.map((list, i) => i === listIndex
                ? { ...list, items: [...list.items, { id: crypto.randomUUID(), text: '', done: false }] }
                : list)
        }, true);
    }

    function updateItemAt(listIndex, itemIndex, patch, immediate = false) {
        apply({
            checklists: draftRef.current.checklists.map((list, i) => i === listIndex
                ? { ...list, items: list.items.map((item, j) => j === itemIndex ? { ...item, ...patch } : item) }
                : list)
        }, immediate);
    }

    function removeItemAt(listIndex, itemIndex) {
        apply({
            checklists: draftRef.current.checklists.map((list, i) => i === listIndex
                ? { ...list, items: list.items.filter((_, j) => j !== itemIndex) }
                : list)
        }, true);
    }

    function toggleAssignee(userID) {
        const current = draftRef.current.assignedUsers;

        apply({
            assignedUsers: current.includes(userID)
                ? current.filter(id => id !== userID)
                : [...current, userID]
        }, true);
    }

    // event handlers
    function commitOnEnter(event) {
        if (event.key !== 'Enter') return;

        event.preventDefault();
        event.currentTarget.blur();
    }

    function handleClose() {
        flush();
        onClose();
    }

    if (!task) return null;

    return createPortal(
        <div className="kanban-modal-overlay" onClick={handleClose}>
            <div className="kanban-modal" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
                <input
                    className="kanban-modal-title"
                    value={draft.title}
                    onChange={e => apply({ title: e.target.value })}
                    onBlur={() => flush()}
                    onKeyDown={commitOnEnter}
                    placeholder="Task title"
                    autoFocus
                />

                <label className="kanban-modal-check">
                    <input
                        type="checkbox"
                        className="kanban-check"
                        checked={draft.isCompleted}
                        onChange={e => apply({ isCompleted: e.target.checked }, true)}
                    />
                    Mark as completed
                </label>

                <div className="kanban-modal-row">
                    <div className="kanban-modal-group kanban-modal-group--grow">
                        <label htmlFor="task-deadline">Deadline</label>
                        <input
                            id="task-deadline"
                            type="date"
                            className="kanban-modal-select"
                            value={draft.deadline}
                            onChange={e => apply({ deadline: e.target.value }, true)}
                            onKeyDown={commitOnEnter}
                        />
                    </div>
                </div>

                <textarea
                    className="kanban-modal-desc"
                    value={draft.description}
                    onChange={e => apply({ description: e.target.value })}
                    onBlur={() => flush()}
                    placeholder="Add a description…"
                    rows={3}
                />

                <div className="kanban-modal-group">
                    <label>Tags</label>

                    <div className="kanban-assignee-row">
                        {tags.filter(tag => (task.tagIDs ?? []).includes(tag.id)).map(tag => (
                            <span key={tag.id} className={`tag-chip ${tag.name ? '' : 'tag-chip--blank'}`} style={{ background: tag.color }} title={tag.name || 'Unnamed tag'}>
                                {tag.name}
                            </span>
                        ))}

                        <button
                            ref={tagBtnRef}
                            type="button"
                            className="kanban-assign-btn"
                            onClick={() => setTagRect(tagRect ? null : tagBtnRef.current.getBoundingClientRect())}
                        >
                            <TagIcon size={13} strokeWidth={2} />
                            Tags
                        </button>

                        {tagRect && (
                            <TagPicker
                                anchorRect={tagRect}
                                tags={tags}
                                selected={task.tagIDs ?? []}
                                onToggle={tagID => {
                                    const current = task.tagIDs ?? [];
                                    onSetTags(current.includes(tagID)
                                        ? current.filter(id => id !== tagID)
                                        : [...current, tagID]);
                                }}
                                onClose={() => setTagRect(null)}
                            />
                        )}
                    </div>
                </div>

                <div className="kanban-modal-group">
                    <label>Assigned to</label>

                    <div className="kanban-assignee-row">
                        {draft.assignedUsers.map(id => {
                            const member = members.find(m => m.id === id);
                            if (!member) return null;

                            return (
                                <span
                                    key={id}
                                    className="kanban-task-avatar"
                                    style={{ background: member.cursorColor }}
                                    title={member.displayName}
                                >
                                    {member.displayName.charAt(0).toUpperCase()}
                                </span>
                            );
                        })}

                        <button
                            ref={assignBtnRef}
                            type="button"
                            className="kanban-assign-btn"
                            onClick={() => setAssignRect(assignRect ? null : assignBtnRef.current.getBoundingClientRect())}
                        >
                            <UserPlus size={13} strokeWidth={2} />
                            Assign
                        </button>

                        {assignRect && (
                            <AssigneeDropdown
                                anchorRect={assignRect}
                                members={members}
                                assigned={draft.assignedUsers}
                                onToggle={toggleAssignee}
                                onClose={() => setAssignRect(null)}
                            />
                        )}
                    </div>
                </div>

                <div className="kanban-modal-group">
                    <div className="kanban-modal-group-head">
                        <label>Checklists</label>
                        <button type="button" className="kanban-subtask-add" onClick={addChecklist}>
                            + Add checklist
                        </button>
                    </div>

                    {draft.checklists.map((list, listIndex) => (
                        <div key={list.id} className="kanban-checklist">
                            <div className="kanban-checklist-head">
                                <input
                                    type="text"
                                    className="kanban-checklist-name"
                                    value={list.name}
                                    placeholder="Checklist name"
                                    onChange={e => updateChecklistAt(listIndex, { name: e.target.value })}
                                    onBlur={() => flush()}
                                    onKeyDown={commitOnEnter}
                                />
                                <span className="kanban-checklist-count">
                                    {list.items.filter(item => item.done).length}/{list.items.length}
                                </span>
                                <button
                                    type="button"
                                    className="kanban-subtask-remove"
                                    onClick={() => removeChecklistAt(listIndex)}
                                    aria-label="Remove checklist"
                                >
                                    ✕
                                </button>
                            </div>

                            <div className="kanban-subtask-list">
                                {list.items.map((item, itemIndex) => (
                                    <div key={item.id} className={`kanban-subtask-row ${item.done ? 'is-done' : ''}`}>
                                        <input
                                            type="checkbox"
                                            className="kanban-check"
                                            checked={item.done}
                                            onChange={e => updateItemAt(listIndex, itemIndex, { done: e.target.checked }, true)}
                                        />
                                        <input
                                            type="text"
                                            className="kanban-subtask-input"
                                            placeholder="Checklist item"
                                            value={item.text}
                                            onChange={e => updateItemAt(listIndex, itemIndex, { text: e.target.value })}
                                            onBlur={() => flush()}
                                            onKeyDown={commitOnEnter}
                                        />
                                        <button
                                            type="button"
                                            className="kanban-subtask-remove"
                                            onClick={() => removeItemAt(listIndex, itemIndex)}
                                            aria-label="Remove item"
                                        >
                                            ✕
                                        </button>
                                    </div>
                                ))}
                            </div>

                            <button
                                type="button"
                                className="kanban-subtask-add kanban-checklist-add-item"
                                onClick={() => addItem(listIndex)}
                            >
                                + Add item
                            </button>
                        </div>
                    ))}

                    {draft.checklists.length === 0 && (
                        <p className="kanban-subtask-empty">No checklists yet</p>
                    )}
                </div>

                <div className="kanban-modal-actions">
                    <span className={`kanban-modal-status is-${status}`}>
                        {status === 'saving' ? 'Saving…' : status === 'saved' ? 'Saved' : ''}
                    </span>

                    <button className="kanban-modal-submit" onClick={handleClose}>Done</button>
                </div>
            </div>
        </div>,
        document.body
    );
}
