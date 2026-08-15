// component imports
import KanbanList from './KanbanList';

// component functions
export default function KanbanColumn({
    column,
    lists,
    tasksByListID,
    tags,
    members,
    focusedListId,
    focusedTaskId,
    canEdit = true,
    dragging,
    dragType,
    insertionPoint,
    isDraggingTaskToEmptyCol,
    isTaskRemoving,
    isListRemoving,
    onAddTask,
    onUpdateList,
    onSetListTags,
    onUpdateTask,
    onSetTaskTags,
    onStartTaskDrag,
    onStartListDrag,
    onOpenTask,
    onFocusClear,
    registerList,
    registerTask,
    registerGhost,
    registerTaskElement,
    registerListElement,
}) {
    // derived variables
    const sortedLists = [...lists].sort((a, b) => (a.listOrder ?? 0) - (b.listOrder ?? 0));

    const listInsertionIndex = insertionPoint?.type === 'list' && insertionPoint.colIndex === column.columnIndex
        ? insertionPoint.insertIndex
        : null;

    return (
        <div className="kanban-column" style={{ '--col': column.columnIndex }}>
            {sortedLists.map((list, index) => (
                <div key={list.id} className="kanban-column-slot">
                    {listInsertionIndex === index && (
                        <div className="kanban-list-insertion-indicator" />
                    )}

                    <KanbanList
                        list={list}
                        tasks={tasksByListID[list.id] ?? []}
                        tags={tags}
                        members={members}
                        isFocused={focusedListId === list.id}
                        focusedTaskId={focusedTaskId}
                        canEdit={canEdit}
                        dragging={dragType === 'task' ? dragging : null}
                        isDraggingList={dragType === 'list' && dragging === list.id}
                        insertionPoint={insertionPoint}
                        isTaskRemoving={isTaskRemoving}
                        isListRemoving={isListRemoving}
                        onUpdate={changes => onUpdateList(list.id, changes)}
                        onSetTags={tagIDs => onSetListTags(list.id, tagIDs)}
                        onAddTask={() => onAddTask(list.id)}
                        onUpdateTask={onUpdateTask}
                        onSetTaskTags={onSetTaskTags}
                        onStartTaskDrag={onStartTaskDrag}
                        onStartListDrag={onStartListDrag}
                        onOpenTask={onOpenTask}
                        onFocusClear={onFocusClear}
                        registerList={registerList}
                        registerTask={registerTask}
                        registerTaskElement={registerTaskElement}
                        registerListElement={registerListElement}
                    />
                </div>
            ))}

            {listInsertionIndex === sortedLists.length && (
                <div className="kanban-list-insertion-indicator" />
            )}

            {isDraggingTaskToEmptyCol && (
                <div
                    className="kanban-ghost-list"
                    ref={el => registerGhost(`ghost-task-col-${column.columnIndex}`, el)}
                >
                    <span>+ Drop to create list</span>
                </div>
            )}

            {dragType === 'list' && sortedLists.length === 0 && (
                <div
                    className="kanban-empty-column-dropzone"
                    ref={el => registerGhost(`ghost-list-col-${column.columnIndex}`, el)}
                />
            )}
        </div>
    );
}