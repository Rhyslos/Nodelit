// component imports
import { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { UserPlus, Tag as TagIcon } from 'lucide-react';
import AssigneeDropdown from './AssigneeDropdown';
import TagPicker from './TagPicker';

// component functions
export default function TaskModal({ task, tags = [], members = [], onSave, onSetTags, onClose }) {
    // derived variables

    // state variables
    const [title, setTitle] = useState(task?.title || '');
    const [description, setDescription] = useState(task?.description || '');
    const [isCompleted, setIsCompleted] = useState(!!task?.isCompleted);
    const [deadline, setDeadline] = useState(task?.deadline || '');
    const [checklists, setChecklists] = useState(task?.checklists || []);
    const [assignedUsers, setAssignedUsers] = useState(task?.assignedUsers || []);
    const [assignRect, setAssignRect] = useState(null);
    const assignBtnRef = useRef(null);
    const [tagRect, setTagRect] = useState(null);
    const tagBtnRef = useRef(null);

    // mutation functions
    function addChecklist() {
        setChecklists(prev => [...prev, { id: crypto.randomUUID(), name: 'Checklist', items: [] }]);
    }

    function updateChecklistAt(index, patch) {
        setChecklists(prev => prev.map((list, i) => i === index ? { ...list, ...patch } : list));
    }

    function removeChecklistAt(index) {
        setChecklists(prev => prev.filter((_, i) => i !== index));
    }

    function addItem(listIndex) {
        setChecklists(prev => prev.map((list, i) => i === listIndex
            ? { ...list, items: [...list.items, { id: crypto.randomUUID(), text: '', done: false }] }
            : list));
    }

    function updateItemAt(listIndex, itemIndex, patch) {
        setChecklists(prev => prev.map((list, i) => i === listIndex
            ? { ...list, items: list.items.map((item, j) => j === itemIndex ? { ...item, ...patch } : item) }
            : list));
    }

    function removeItemAt(listIndex, itemIndex) {
        setChecklists(prev => prev.map((list, i) => i === listIndex
            ? { ...list, items: list.items.filter((_, j) => j !== itemIndex) }
            : list));
    }

    function toggleAssignee(userID) {
        setAssignedUsers(prev => prev.includes(userID)
            ? prev.filter(id => id !== userID)
            : [...prev, userID]);
    }

    // event handlers
    function handleSave() {
        onSave({
            title: title.trim() || 'New Task',
            description,
            isCompleted,
            deadline,
            checklists,
            assignedUsers
        });
    }

    if (!task) return null;

    return createPortal(
        <div className="kanban-modal-overlay" onClick={onClose}>
            <div className="kanban-modal" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
                <input
                    className="kanban-modal-title"
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    placeholder="Task title"
                    autoFocus
                />

                <label className="kanban-modal-check">
                    <input
                        type="checkbox"
                        className="kanban-check"
                        checked={isCompleted}
                        onChange={e => setIsCompleted(e.target.checked)}
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
                            value={deadline}
                            onChange={e => setDeadline(e.target.value)}
                        />
                    </div>


                </div>

                <textarea
                    className="kanban-modal-desc"
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    placeholder="Add a description…"
                    rows={3}
                />

                <div className="kanban-modal-group">
                    <label>Tags</label>

                    <div className="kanban-assignee-row">
                        {tags.filter(tag => (task?.tagIDs ?? []).includes(tag.id)).map(tag => (
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
                                selected={task?.tagIDs ?? []}
                                onToggle={tagID => {
                                    const current = task?.tagIDs ?? [];
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
                        {assignedUsers.map(id => {
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
                                assigned={assignedUsers}
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

                    {checklists.map((list, listIndex) => (
                        <div key={list.id} className="kanban-checklist">
                            <div className="kanban-checklist-head">
                                <input
                                    type="text"
                                    className="kanban-checklist-name"
                                    value={list.name}
                                    placeholder="Checklist name"
                                    onChange={e => updateChecklistAt(listIndex, { name: e.target.value })}
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
                                            onChange={e => updateItemAt(listIndex, itemIndex, { done: e.target.checked })}
                                        />
                                        <input
                                            type="text"
                                            className="kanban-subtask-input"
                                            placeholder="Checklist item"
                                            value={item.text}
                                            onChange={e => updateItemAt(listIndex, itemIndex, { text: e.target.value })}
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

                    {checklists.length === 0 && (
                        <p className="kanban-subtask-empty">No checklists yet</p>
                    )}
                </div>

                <div className="kanban-modal-actions">
                    <button className="kanban-modal-cancel" onClick={onClose}>Cancel</button>
                    <button className="kanban-modal-submit" onClick={handleSave}>Save changes</button>
                </div>
            </div>
        </div>,
        document.body
    );
}
