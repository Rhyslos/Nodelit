// component imports
import { useState, useRef, useEffect } from 'react';
import { Eye, EyeOff, UserPlus, GripVertical, AlignLeft, CalendarDays, ListChecks, Square, Check, Tag as TagIcon } from 'lucide-react';
import TagPicker from './TagPicker';
import AssigneeDropdown from './AssigneeDropdown';
import { useKanban } from '../../contexts/KanbanContext';

// component functions
export default function KanbanTask({
    task,
    tags = [],
    members = [],
    isDragging,
    isFocused,
    isClone,
    canEdit = true,
    onUpdate,
    onSetTags,
    onStartDrag,
    onOpen,
    onFocusClear,
    registerTask,
    registerElement,
}) {
    // state variables
    const [tagRect, setTagRect] = useState(null);
    const tagBtnRef = useRef(null);
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

    useEffect(() => {
        if (!isFocused) return;

        const el = titleRef.current;
        if (!el || !el.isConnected) return;

        el.focus();

        const range = document.createRange();
        range.selectNodeContents(el);

        const selection = window.getSelection();
        if (selection) {
            selection.removeAllRanges();
            selection.addRange(range);
        }
    }, [isFocused]);

    // derived variables
    const taskTags = tags.filter(tag => task.tagIDs?.includes(tag.id));
    const bannerColor = taskTags[0]?.color || 'var(--border)';
    const checklists = task.checklists ?? [];
    const totalSubtasks = checklists.reduce((sum, list) => sum + list.items.length, 0);
    const completedSubtasks = checklists.reduce((sum, list) => sum + list.items.filter(item => item.done).length, 0);
    const assignees = members.filter(m => task.assignedUsers?.includes(m.id));

    // event handlers
    function handleClick(e) {
        if (
            e.target.closest('.kanban-task-title') ||
            e.target.closest('.kanban-task-checkbox') ||
            e.target.closest('.kanban-task-tag-btn') ||
            e.target.closest('.kanban-task-eye-btn') ||
            e.target.closest('.kanban-task-assign-btn') ||
            e.target.closest('.tag-picker') ||
            e.target.closest('.kanban-task-drag-handle')
        ) return;

        onOpen(task);
    }

    function handleTitleBlur() {
        const text = titleRef.current?.textContent.trim() || 'New Task';
        if (text !== task.title) onUpdate({ title: text });
        onFocusClear?.();
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
                            <GripVertical size={14} strokeWidth={2} />
                        </div>
                    )}
                </div>

                <div className="kanban-task-indicators">
                    {task.description && (
                        <span className="kanban-task-indicator" title="Has description"><AlignLeft size={12} strokeWidth={2} /></span>
                    )}

                    {task.deadline && (
                        <span className="kanban-task-indicator" title={`Due ${task.deadline}`}>
                            <CalendarDays size={12} strokeWidth={2} />
                            {task.deadline}
                        </span>
                    )}

                    {totalSubtasks > 0 && (
                        <span className="kanban-task-indicator" title="Subtasks">
                            <ListChecks size={12} strokeWidth={2} />
                            {completedSubtasks}/{totalSubtasks}
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
                    <div className="kanban-task-checklists">
                        {checklists.filter(list => list.items.length > 0).map(list => (
                            <div key={list.id} className="kanban-task-checklist-group">
                                <span className="kanban-task-checklist-title">
                                    {list.name} · {list.items.filter(item => item.done).length}/{list.items.length}
                                </span>

                                <ul className="kanban-task-checklist">
                                    {list.items.map(item => (
                                        <li
                                            key={item.id}
                                            className={`kanban-task-checklist-item ${item.done ? 'is-done' : ''}`}
                                        >
                                            <span className="kanban-task-checklist-mark">
                                                {item.done
                                                    ? <Check size={12} strokeWidth={2.5} />
                                                    : <Square size={12} strokeWidth={2} />}
                                            </span>
                                            {item.text || 'Untitled item'}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ))}
                    </div>
                )}

                <div className="kanban-task-cat-row">
                    {taskTags.length > 0 && (
                        <span className="kanban-task-tags">
                            {taskTags.map(tag => (
                                <span key={tag.id} className={`tag-chip ${tag.name ? '' : 'tag-chip--blank'}`} style={{ background: tag.color }} title={tag.name || 'Unnamed tag'}>
                                    {tag.name}
                                </span>
                            ))}
                        </span>
                    )}

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
                            ref={tagBtnRef}
                            className="kanban-task-tag-btn"
                            title="Tags"
                            onClick={e => {
                                e.stopPropagation();
                                setTagRect(tagRect ? null : tagBtnRef.current.getBoundingClientRect());
                            }}
                        >
                            <TagIcon size={13} strokeWidth={2} />
                        </button>
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

                    {assignRect && (
                        <AssigneeDropdown
                            anchorRect={assignRect}
                            members={members}
                            assigned={task.assignedUsers ?? []}
                            onToggle={userID => {
                                const current = task.assignedUsers ?? [];
                                onUpdate({ assignedUsers: current.includes(userID)
                                    ? current.filter(id => id !== userID)
                                    : [...current, userID] });
                            }}
                            onClose={() => setAssignRect(null)}
                        />
                    )}
                </div>
            </div>
        </div>
    );
}