// component imports
import { useEffect, useRef, useState } from 'react';
import { Tag as TagIcon, GripVertical, Plus, ChevronRight } from 'lucide-react';
import { orderListTasks } from '../../lib/taskOrder';
import KanbanTask from './KanbanTask';
import AnimatedRemoval from '../AnimatedRemoval';
import TagPicker from './TagPicker';

// component functions
// completed section helpers: each list remembers whether its Completed section is open, per browser
const COMPLETED_STORAGE_PREFIX = 'nodelit:completed-open:';

function readCompletedOpen(listID) {
    try {
        return localStorage.getItem(COMPLETED_STORAGE_PREFIX + listID) === '1';
    } catch {
        return false;
    }
}

function writeCompletedOpen(listID, open) {
    try {
        if (open) localStorage.setItem(COMPLETED_STORAGE_PREFIX + listID, '1');
        else localStorage.removeItem(COMPLETED_STORAGE_PREFIX + listID);
    } catch {
        // storage can be unavailable, the section just starts closed next time
    }
}

export default function KanbanList({
    list,
    tasks,
    tags = [],
    members,
    isFocused,
    focusedTaskId,
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
    onTaskContextMenu,
    onListContextMenu,
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
    const sortedTasks = orderListTasks(tasks);
    const openCount = sortedTasks.filter(task => !task.isCompleted).length;
    const completedCount = sortedTasks.length - openCount;
    const [completedOpen, setCompletedOpen] = useState(() => readCompletedOpen(list.id));

    const taskInsertionIndex = insertionPoint?.type === 'task' && insertionPoint.listId === list.id
        ? insertionPoint.insertIndex
        : null;

    // render functions
    function renderTask(task, index) {
        return (
            <div key={task.id}>
                {taskInsertionIndex === index && index !== openCount && (
                    <div className="kanban-insertion-indicator" />
                )}

                <AnimatedRemoval removing={isTaskRemoving?.(task.id) ?? false}>
                    <KanbanTask
                        task={task}
                        tags={tags}
                        members={members}
                        isDragging={dragging === task.id}
                        isFocused={focusedTaskId === task.id}
                        canEdit={canEdit}
                        onUpdate={changes => onUpdateTask(task.id, changes)}
                        onSetTags={tagIDs => onSetTaskTags(task.id, tagIDs)}
                        onStartDrag={onStartTaskDrag}
                        onOpen={() => onOpenTask(task)}
                        onFocusClear={onFocusClear}
                        onContextMenu={onTaskContextMenu}
                        registerTask={registerTask}
                        registerElement={registerTaskElement}
                    />
                </AnimatedRemoval>
            </div>
        );
    }

    function toggleCompleted() {
        setCompletedOpen(current => {
            writeCompletedOpen(list.id, !current);
            return !current;
        });
    }

    return (
        <AnimatedRemoval removing={isListRemoving?.(list.id) ?? false}>
            <div
                className={`kanban-list ${isDraggingList ? 'is-dragging-list' : ''}`}
                ref={listRef}
                onContextMenu={e => {
                    // a long press is a drag on touch screens, not a right click
                    if (window.matchMedia('(pointer: coarse)').matches) {
                        e.preventDefault();
                        return;
                    }

                    if (!onListContextMenu) return;
                    e.preventDefault();
                    e.stopPropagation();
                    onListContextMenu(e, list);
                }}
            >
                <div
                    className="kanban-list-header"
                    onTouchStart={e => {
                        if (canEdit) onStartListDrag(e, list, listRef.current);
                    }}
                >
                    {canEdit && (
                        <div
                            className="kanban-list-drag-handle"
                            onMouseDown={e => onStartListDrag(e, list, listRef.current)}
                            title="Drag to move list"
                        >
                            <GripVertical size={14} strokeWidth={2} />
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
                    {sortedTasks.slice(0, openCount).map((task, index) => renderTask(task, index))}

                    {/* the indicator sits at the end of the open tasks when dropping below them */}
                    {taskInsertionIndex !== null && taskInsertionIndex >= openCount
                        && (!completedOpen || taskInsertionIndex === openCount) && (
                        <div className="kanban-insertion-indicator" />
                    )}
                </div>

                {canEdit && (
                    <button className="kanban-add-task-btn" onClick={onAddTask}>
                        <Plus size={14} strokeWidth={2} />
                        Add task
                    </button>
                )}

                {completedCount > 0 && (
                    <div className={`kanban-completed ${completedOpen ? 'is-open' : ''}`}>
                        <button
                            type="button"
                            className="kanban-completed-toggle"
                            aria-expanded={completedOpen}
                            onClick={() => toggleCompleted()}
                        >
                            <ChevronRight size={14} strokeWidth={2.4} className="kanban-completed-chevron" />
                            Completed
                            <span className="kanban-completed-count">{completedCount}</span>
                        </button>

                        {completedOpen && (
                            <div className="kanban-task-container kanban-completed-tasks">
                                {sortedTasks.slice(openCount).map((task, index) => renderTask(task, openCount + index))}

                                {taskInsertionIndex === sortedTasks.length && taskInsertionIndex > openCount && (
                                    <div className="kanban-insertion-indicator" />
                                )}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </AnimatedRemoval>
    );
}