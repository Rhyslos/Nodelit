// ui components
import { useState } from 'react';
import { createPortal } from 'react-dom';

export default function TaskModal({ task, categories = [], onSave, onClose }) {
    
    // state variables
    const [title, setTitle] = useState(task?.title || '');
    const [description, setDescription] = useState(task?.description || '');
    const [isCompleted, setIsCompleted] = useState(task?.isCompleted || false);
    const [category, setCategory] = useState(task?.originalCategory || '');
    const [color, setColor] = useState(task?.color || '#ffffff');
    const [deadline, setDeadline] = useState(task?.deadline || '');
    const [subtasks, setSubtasks] = useState(task?.subtasks || []);

    // task functions
    function addSubtask() {
        setSubtasks([...subtasks, { id: crypto.randomUUID(), text: '', done: false }]);
    }

    function updateSubtaskAt(index, patch) {
        setSubtasks(prev => prev.map((st, i) => i === index ? { ...st, ...patch } : st));
    }

    function handleSave() {
        onSave({
            title,
            description,
            isCompleted,
            originalCategory: category,
            color,
            deadline,
            subtasks,
            updatedAt: task?.updatedAt 
        });
    }

    if (!task) return null;

    return createPortal(
        <div
            onClick={onClose}
            style={{
                position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
                backgroundColor: 'rgba(0, 0, 0, 0.5)', display: 'flex',
                justifyContent: 'center', alignItems: 'center', zIndex: 99999, backdropFilter: 'blur(2px)'
            }}
        >
            <div
                onClick={e => e.stopPropagation()}
                style={{
                    backgroundColor: 'var(--panel, #ffffff)', width: '500px', maxWidth: '90vw',
                    padding: '24px', borderRadius: '12px', border: '1px solid var(--border, #ddd)',
                    boxShadow: '0 10px 30px rgba(0,0,0,0.3)', display: 'flex',
                    flexDirection: 'column', gap: '16px', color: 'var(--ink, #000)',
                    maxHeight: '80vh', overflowY: 'auto'
                }}
            >
                <input
                    className="kanban-modal-title"
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    placeholder="Task title"
                    autoFocus
                />

                <div style={{ display: 'flex', gap: '10px' }}>
                    <div className="kanban-modal-group" style={{ flex: 1 }}>
                        <label>Deadline</label>
                        <input
                            type="date"
                            className="kanban-modal-select"
                            value={deadline}
                            onChange={e => setDeadline(e.target.value)}
                        />
                    </div>
                    <div className="kanban-modal-group">
                        <label>Task Color</label>
                        <input
                            type="color"
                            value={color}
                            onChange={e => setColor(e.target.value)}
                            style={{ height: '38px', width: '60px', border: 'none', background: 'none' }}
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
                    <label style={{ display: 'flex', justifyContent: 'space-between' }}>
                        Checkboxes
                        <button onClick={addSubtask} style={{ fontSize: '12px', cursor: 'pointer', background: 'none', border: 'none', color: 'inherit' }}>+ Add</button>
                    </label>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        {subtasks.map((st, i) => (
                            <div key={st.id} style={{ display: 'flex', gap: '8px' }}>
                                <input
                                    type="checkbox"
                                    checked={st.done}
                                    onChange={e => updateSubtaskAt(i, { done: e.target.checked })}
                                />
                                <input
                                    type="text"
                                    value={st.text}
                                    style={{ flex: 1, border: 'none', background: 'var(--accent-lt)' }}
                                    onChange={e => updateSubtaskAt(i, { text: e.target.value })}
                                />
                            </div>
                        ))}
                    </div>
                </div>

                <div className="modal-actions">
                    <button className="modal-cancel" onClick={onClose}>Cancel</button>
                    <button className="modal-submit" onClick={handleSave}>Save</button>
                </div>
            </div>
        </div>,
        document.body
    );
}