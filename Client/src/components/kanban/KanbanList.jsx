// component imports
import { useEffect, useRef, useState } from 'react';
import { Tag as TagIcon } from 'lucide-react';
import KanbanTask from './KanbanTask';
import AnimatedRemoval from '../AnimatedRemoval';
import TagPicker from './TagPicker';

// component functions
export default function KanbanList({
    list,
    tasks,
    tags = [],
    members,
    isFocused,
    canEdit = true,
    dragging,
    insertionPoint,
    isDraggingList,
    isTaskRemoving,
    isListRemoving,
    onUpdate,
    onSetTags,
    onAddTask,
    onUpdateTask,
    onSetTaskTags,
    onStartTaskDrag,
    onStartListDrag,
    onOpenTask,
    onFocusClear,
    registerList,
    registerTask,
    registerTaskElement,
    registerListElement,
}) {
    // dom references
    const nameRef = useRef(null);
    const listRef = useRef(null);
    const tagBtnRef = useRef(null);

    // state variables
    const [tagRect, setTagRect] = useState(null);

    // lifecycle functions
    useEffect(() => {
        const el = listRef.current;
        if (registerList) registerList(list.id, el);
        if (registerListElement) registerListElement(list.id, el);

        return () => {
            if (registerList) registerList(list.id, null);
            if (registerListElement) registerListElement(list.id, null);
        };
    }, [list.id, registerList, registerListElement]);

    useEffect(() => {
        if (!isFocused) return;

        const el = nameRef.current;
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

    // event handlers
    function handleNameBlur() {
        const text = nameRef.current?.textContent.trim() || 'New list';
        if (text !== list.name) onUpdate({ name: text });
        onFocusClear();
    }

    function handleNameKeyDown(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            nameRef.current?.blur();
        }
    }

    // derived variables
    const listTags = tags.filter(tag => list.tagIDs?.includes(tag.id));
    const sortedTasks = [...tasks].sort((a, b) => a.taskOrder - b.taskOrder);

    const taskInsertionIndex = insertionPoint?.type === 'task' && insertionPoint.listId === list.id
        ? insertionPoint.insertIndex
        : null;

    return (
        <AnimatedRemoval removing={isListRemoving?.(list.id) ?? false}>
            <div
                className={`kanban-list ${isDraggingList ? 'is-dragging-list' : ''}`}
                ref={listRef}
            >
                <div className="kanban-list-header">
                    {canEdit && (
                        <div
                            className="kanban-list-drag-handle"
                            onMouseDown={e => onStartListDrag(e, list, listRef.current)}
                            title="Drag to move list"
                        >
                            ⋮⋮
                        </div>
                    )}

                    {canEdit && (
                        <button
                            ref={tagBtnRef}
                            className="kanban-list-tag-btn"
                            title="Tags"
                            onClick={e => {
                                e.stopPropagation();
                                setTagRect(tagRect ? null : tagBtnRef.current.getBoundingClientRect());
                            }}
                        >
                            <TagIcon size={13} strokeWidth={2} />
                        </button>
                    )}

                    {tagRect && (
                        <TagPicker
                            anchorRect={tagRect}
                            tags={tags}
                            selected={list.tagIDs ?? []}
                            onToggle={tagID => {
                                const current = list.tagIDs ?? [];
                                onSetTags(current.includes(tagID)
                                    ? current.filter(id => id !== tagID)
                                    : [...current, tagID]);
                            }}
                            onClose={() => setTagRect(null)}
                        />
                    )}

                    <span
                        ref={nameRef}
                        className="kanban-list-name"
                        contentEditable={canEdit}
                        suppressContentEditableWarning
                        onBlur={handleNameBlur}
                        onKeyDown={handleNameKeyDown}
                    >
                        {list.name}
                    </span>

                    {listTags.map(tag => (
                        <span key={tag.id} className={`tag-chip ${tag.name ? '' : 'tag-chip--blank'}`} style={{ background: tag.color }} title={tag.name || 'Unnamed tag'}>
                            {tag.name}
                        </span>
                    ))}

                </div>

                <div className="kanban-task-container">
                    {sortedTasks.map((task, index) => (
                        <div key={task.id}>
                            {taskInsertionIndex === index && (
                                <div className="kanban-insertion-indicator" />
                            )}

                            <AnimatedRemoval removing={isTaskRemoving?.(task.id) ?? false}>
                                <KanbanTask
                                    task={task}
                                    tags={tags}
                                    members={members}
                                    isDragging={dragging === task.id}
                                    canEdit={canEdit}
                                    onUpdate={changes => onUpdateTask(task.id, changes)}
                                    onSetTags={tagIDs => onSetTaskTags(task.id, tagIDs)}
                                    onStartDrag={onStartTaskDrag}
                                    onOpen={() => onOpenTask(task)}
                                    registerTask={registerTask}
                                    registerElement={registerTaskElement}
                                />
                            </AnimatedRemoval>
                        </div>
                    ))}

                    {taskInsertionIndex === sortedTasks.length && (
                        <div className="kanban-insertion-indicator" />
                    )}
                </div>

                {canEdit && (
                    <button className="kanban-add-task-btn" onClick={onAddTask}>
                        + Add task
                    </button>
                )}
            </div>
        </AnimatedRemoval>
    );
}
