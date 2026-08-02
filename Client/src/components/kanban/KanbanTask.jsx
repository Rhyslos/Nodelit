// hook imports
import { useState, useRef, useEffect } from 'react';

// component imports
import CategoryDropdown from './CategoryDropdown';

// ui components
export default function KanbanTask({
    task,
    categories,
    isDragging,
    isClone,
    onUpdate,
    onStartDrag,
    onOpen,
    registerTask,
    registerElement,
}) {
    // state variables
    const [showCatDropdown, setShowCatDropdown] = useState(false);
    
    // dom references
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

    // data processing functions
    const categoryData = categories.find(c => c.name === task.originalCategory);
    const activeBannerColor = task.color || categoryData?.color || '#555';
    const totalSubtasks = task.subtasks?.length || 0;
    const completedSubtasks = task.subtasks?.filter(st => st.done).length || 0;

    // event functions
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
        onUpdate({ title: text });
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
            className={`kanban-task ${isDragging ? 'is-dragging' : ''} ${isClone ? 'is-clone' : ''}`}
            onClick={handleClick}
        >
            <div className="kanban-task-banner" style={{ background: activeBannerColor }} />

            <div className="kanban-task-body" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>

                <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                    <input
                        type="checkbox"
                        className="kanban-task-checkbox"
                        checked={task.isCompleted}
                        onChange={e => onUpdate({ isCompleted: e.target.checked })}
                        style={{ marginTop: '3px', flexShrink: 0 }}
                    />

                    <span
                        ref={titleRef}
                        className="kanban-task-title"
                        contentEditable={!isClone}
                        suppressContentEditableWarning
                        onBlur={handleTitleBlur}
                        onKeyDown={handleTitleKeyDown}
                        onMouseDown={e => {
                            e.stopPropagation();
                            setTimeout(() => titleRef.current?.focus(), 0);
                        }}
                        style={{ flex: 1, minWidth: 0, wordBreak: 'break-word', outline: 'none' }}
                    >
                        {task.title}
                    </span>

                    <div
                        className="kanban-task-drag-handle"
                        onMouseDown={e => onStartDrag(e, task, taskRef.current)}
                        style={{ cursor: 'grab', color: '#aaa', padding: '0 4px', fontSize: '14px', userSelect: 'none', flexShrink: 0 }}
                        title="Drag to move"
                    >
                        ⋮⋮
                    </div>
                </div>

                <div className="kanban-task-indicators" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {task.description && (
                        <span title="Has description" style={{ fontSize: '12px', color: 'var(--muted)' }}>
                            ☰
                        </span>
                    )}

                    {task.deadline && (
                        <span title={`Deadline: ${task.deadline}`} style={{ fontSize: '11px', color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: '2px' }}>
                            📅 {task.deadline}
                        </span>
                    )}

                    {totalSubtasks > 0 && (
                        <span title="Subtasks" style={{ fontSize: '11px', color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: '2px' }}>
                            ☑ {completedSubtasks}/{totalSubtasks}
                        </span>
                    )}

                    {task.assignedUsers?.length > 0 && (
                        <span title="Assigned members" style={{ fontSize: '11px', color: 'var(--muted)' }}>
                            👤 {task.assignedUsers.length}
                        </span>
                    )}
                </div>

                <div className="kanban-task-cat-row">
                    <span className="kanban-task-cat-label">
                        {task.originalCategory || 'No category'}
                    </span>
                    {!isClone && (
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
                            selected={task.originalCategory}
                            onSelect={cat => {
                                onUpdate({ originalCategory: cat.name, color: cat.color });
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