// component imports
import { useState, useRef, useEffect } from 'react';
import CategoryDropdown from './CategoryDropdown';

// component functions
export default function KanbanTask({
    task,
    categories,
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

    // event handlers
    function handleClick(e) {
        if (
            e.target.closest('.kanban-task-title') ||
            e.target.closest('.kanban-task-checkbox') ||
            e.target.closest('.kanban-task-cat-btn') ||
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
                        </span>
                    )}

                    {task.assignedUsers?.length > 0 && (
                        <span className="kanban-task-indicator" title="Assigned members">
                            👤 {task.assignedUsers.length}
                        </span>
                    )}
                </div>

                <div className="kanban-task-cat-row">
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
