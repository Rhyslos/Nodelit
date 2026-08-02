// component imports
import { useState } from 'react';
import { createPortal } from 'react-dom';

// component functions
export default function TaskModal({ task, categories = [], onSave, onClose }) {
    // derived variables
    const fallbackColor = categories.find(c => c.name === task?.category)?.color ?? '#c8502a';

    // state variables
    const [title, setTitle] = useState(task?.title || '');
    const [description, setDescription] = useState(task?.description || '');
    const [isCompleted, setIsCompleted] = useState(!!task?.isCompleted);
    const [category, setCategory] = useState(task?.category || '');
    const [color, setColor] = useState(task?.color || fallbackColor);
    const [deadline, setDeadline] = useState(task?.deadline || '');
    const [subtasks, setSubtasks] = useState(task?.subtasks || []);

    // mutation functions
    function addSubtask() {
        setSubtasks(prev => [...prev, { id: crypto.randomUUID(), text: '', done: false }]);
    }

    function updateSubtaskAt(index, patch) {
        setSubtasks(prev => prev.map((st, i) => i === index ? { ...st, ...patch } : st));
    }

    function removeSubtaskAt(index) {
        setSubtasks(prev => prev.filter((_, i) => i !== index));
    }

    // event handlers
    function handleSave() {
        onSave({
            title: title.trim() || 'New Task',
            description,
            isCompleted,
            category: category || null,
            color,
            deadline,
            subtasks
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

                    <div className="kanban-modal-group kanban-modal-group--grow">
                        <label htmlFor="task-category">Category</label>
                        <select
                            id="task-category"
                            className="kanban-modal-select"
                            value={category}
                            onChange={e => {
                                const next = e.target.value;
                                setCategory(next);
                                const match = categories.find(c => c.name === next);
                                if (match) setColor(match.color);
                            }}
                        >
                            <option value="">No category</option>
                            {categories.map(c => (
                                <option key={c.id} value={c.name}>{c.name}</option>
                            ))}
                        </select>
                    </div>

                    <div className="kanban-modal-group">
                        <label htmlFor="task-color">Colour</label>
                        <input
                            id="task-color"
                            type="color"
                            className="kanban-modal-color"
                            value={color}
                            onChange={e => setColor(e.target.value)}
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
                    <div className="kanban-modal-group-head">
                        <label>Checklist</label>
                        <button type="button" className="kanban-subtask-add" onClick={addSubtask}>
                            + Add item
                        </button>
                    </div>

                    <div className="kanban-subtask-list">
                        {subtasks.map((st, i) => (
                            <div key={st.id} className={`kanban-subtask-row ${st.done ? 'is-done' : ''}`}>
                                <input
                                    type="checkbox"
                                    className="kanban-check"
                                    checked={st.done}
                                    onChange={e => updateSubtaskAt(i, { done: e.target.checked })}
                                />
                                <input
                                    type="text"
                                    className="kanban-subtask-input"
                                    placeholder="Checklist item"
                                    value={st.text}
                                    onChange={e => updateSubtaskAt(i, { text: e.target.value })}
                                />
                                <button
                                    type="button"
                                    className="kanban-subtask-remove"
                                    onClick={() => removeSubtaskAt(i)}
                                    aria-label="Remove item"
                                >
                                    ✕
                                </button>
                            </div>
                        ))}

                        {subtasks.length === 0 && (
                            <p className="kanban-subtask-empty">Nothing on the checklist yet</p>
                        )}
                    </div>
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
