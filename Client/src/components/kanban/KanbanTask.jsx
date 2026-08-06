// component imports
import { useState, useRef, useEffect } from 'react';
import { Eye, EyeOff, UserPlus } from 'lucide-react';
import CategoryDropdown from './CategoryDropdown';
import AssigneeDropdown from './AssigneeDropdown';
import { useKanban } from '../../contexts/KanbanContext';

// component functions
export default function KanbanTask({
    task,
    categories,
    members = [],
    isDragging,
    isClone,
    canEdit = true,
    onUpdate,
    onStartDrag,
    onOpen,
    registerTask,
    registerElement,
}) {
    // state variables
    const [showCatDropdown, setShowCatDropdown] = useState(false);
    const [assignRect, setAssignRect] = useState(null);
    const assignBtnRef = useRef(null);
    const { expandedChecklists, toggleChecklist } = useKanban();
    const showChecklist = expandedChecklists.has(task.id);
    const titleRef = useRef(null);
    const taskRef = useRef(null);

    // lifecycle functions
    useEffect(() => {
        const el = taskRef.current;
        if (registerTask) registerTask(task.id, el);
        if (registerElement && !isClone) registerElement(task.id, el);

        return () => {
            if (registerTask) registerTask(task.id, null);
            if (registerElement && !isClone) registerElement(task.id, null);
        };
    }, [task.id, registerTask, registerElement, isClone]);

    // derived variables
    const categoryData = categories.find(c => c.name === task.category);
    const bannerColor = task.color || categoryData?.color || 'var(--border)';
    const totalSubtasks = task.subtasks?.length || 0;
    const completedSubtasks = task.subtasks?.filter(st => st.done).length || 0;
    const assignees = members.filter(m => task.assignedUsers?.includes(m.id));

    // event handlers
    function handleClick(e) {
        if (
            e.target.closest('.kanban-task-title') ||
            e.target.closest('.kanban-task-checkbox') ||
            e.target.closest('.kanban-task-cat-btn') ||
            e.target.closest('.kanban-task-eye-btn') ||
            e.target.closest('.kanban-task-assign-btn') ||
            e.target.closest('.cat-dropdown') ||
            e.target.closest('.kanban-task-drag-handle')
        ) return;

        onOpen(task);
    }

    function handleTitleBlur() {
        const text = titleRef.current?.textContent.trim() || 'New Task';
        if (text !== task.title) onUpdate({ title: text });
    }

    function handleTitleKeyDown(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            titleRef.current?.blur();
        }
    }

    return (
        <div
            ref={taskRef}
            className={[
                'kanban-task',
                isDragging ? 'is-dragging' : '',
                isClone ? 'is-clone' : '',
                task.isCompleted ? 'is-completed' : ''
            ].filter(Boolean).join(' ')}
            onClick={handleClick}
        >
            <div className="kanban-task-banner" style={{ background: bannerColor }} />

            <div className="kanban-task-body">
                <div className="kanban-task-main">
                    <input
                        type="checkbox"
                        className="kanban-check kanban-task-checkbox"
                        checked={!!task.isCompleted}
                        disabled={!canEdit}
                        onChange={e => onUpdate({ isCompleted: e.target.checked })}
                    />

                    <span
                        ref={titleRef}
                        className="kanban-task-title"
                        contentEditable={canEdit && !isClone}
                        suppressContentEditableWarning
                        onBlur={handleTitleBlur}
                        onKeyDown={handleTitleKeyDown}
                        onMouseDown={e => {
                            e.stopPropagation();
                            setTimeout(() => titleRef.current?.focus(), 0);
                        }}
                    >
                        {task.title}
                    </span>

                    {canEdit && (
                        <div
                            className="kanban-task-drag-handle"
                            onMouseDown={e => onStartDrag(e, task, taskRef.current)}
                            title="Drag to move"
                        >
                            ⋮⋮
                        </div>
                    )}
                </div>

                <div className="kanban-task-indicators">
                    {task.description && (
                        <span className="kanban-task-indicator" title="Has description">☰</span>
                    )}

                    {task.deadline && (
                        <span className="kanban-task-indicator" title={`Due ${task.deadline}`}>
                            📅 {task.deadline}
                        </span>
                    )}

                    {totalSubtasks > 0 && (
                        <span className="kanban-task-indicator" title="Subtasks">
                            ☑ {completedSubtasks}/{totalSubtasks}
                            <button
                                type="button"
                                className="kanban-task-eye-btn"
                                title={showChecklist ? 'Hide checklist' : 'Show checklist'}
                                aria-label={showChecklist ? 'Hide checklist' : 'Show checklist'}
                                onClick={e => { e.stopPropagation(); toggleChecklist(task.id); }}
                            >
                                {showChecklist ? <EyeOff size={13} strokeWidth={2} /> : <Eye size={13} strokeWidth={2} />}
                            </button>
                        </span>
                    )}

                </div>

                {showChecklist && totalSubtasks > 0 && (
                    <ul className="kanban-task-checklist">
                        {task.subtasks.map(item => (
                            <li
                                key={item.id}
                                className={`kanban-task-checklist-item ${item.done ? 'is-done' : ''}`}
                            >
                                <span className="kanban-task-checklist-mark">{item.done ? '☑' : '☐'}</span>
                                {item.text || 'Untitled item'}
                            </li>
                        ))}
                    </ul>
                )}

                <div className="kanban-task-cat-row">
                    {assignees.length > 0 && (
                        <span className="kanban-task-assignees">
                            {assignees.map(member => (
                                <span
                                    key={member.id}
                                    className="kanban-task-avatar"
                                    style={{ background: member.cursorColor }}
                                    title={member.displayName}
                                >
                                    {member.displayName.charAt(0).toUpperCase()}
                                </span>
                            ))}
                        </span>
                    )}

                    {canEdit && !isClone && (
                        <button
                            ref={assignBtnRef}
                            className="kanban-task-assign-btn"
                            title="Assign members"
                            onClick={e => {
                                e.stopPropagation();
                                setAssignRect(assignRect ? null : assignBtnRef.current.getBoundingClientRect());
                            }}
                        >
                            <UserPlus size={13} strokeWidth={2} />
                        </button>
                    )}

                    {assignRect && (
                        <AssigneeDropdown
                            anchorRect={assignRect}
                            members={members}
                            assigned={task.assignedUsers ?? []}
                            onToggle={userID => {
                                const current = task.assignedUsers ?? [];
                                const next = current.includes(userID)
                                    ? current.filter(id => id !== userID)
                                    : [...current, userID];
                                onUpdate({ assignedUsers: next });
                            }}
                            onClose={() => setAssignRect(null)}
                        />
                    )}

                    <span className="kanban-task-cat-label">
                        {task.category || 'No category'}
                    </span>

                    {canEdit && !isClone && (
                        <button
                            className="kanban-task-cat-btn"
                            onClick={e => { e.stopPropagation(); setShowCatDropdown(o => !o); }}
                        >
                            ▾
                        </button>
                    )}

                    {showCatDropdown && (
                        <CategoryDropdown
                            categories={categories}
                            selected={task.category}
                            onSelect={cat => {
                                onUpdate({ category: cat.name, color: cat.color });
                                setShowCatDropdown(false);
                            }}
                            onClose={() => setShowCatDropdown(false)}
                        />
                    )}
                </div>
            </div>
        </div>
    );
}
