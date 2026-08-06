// imports
import { useState, useRef, useMemo } from "react";
import { useParams } from "react-router-dom";
import { useKanban } from "../contexts/KanbanContext";
import { useColumns } from "../hooks/useColumns";
import { useLists } from "../hooks/useLists";
import { useTasks } from "../hooks/useTasks";
import { useTabs } from "../hooks/useTabs";
import { useWorkspaces } from "../hooks/useWorkspaces";
import { useAuth } from '../contexts/AuthContext';
import { useDragDrop } from "../hooks/useDragDrop";
import { useFlipAnimation } from "../hooks/useFlipAnimation";
import { useAnimatedRemoval } from "../hooks/useAnimatedRemoval";
import KanbanTabs from "../components/kanban/KanbanTabs";
import KanbanColumn from "../components/kanban/KanbanColumn";
import KanbanTask from "../components/kanban/KanbanTask";
import TaskModal from "../components/kanban/TaskModal";
import DeleteDropZone from "../components/kanban/DeleteDropZone";

// page component
export default function Kanban() {
    const { workspaceID } = useParams();
    const { user } = useAuth();
    const { canEdit } = useKanban();
    
    // data layer
    const { categories } = useWorkspaces(user?.id);
    const { tabs, activeTabId, setActiveTabId, addTab, updateTab, archiveTab, deleteTab } = useTabs(workspaceID);
    const { columns, addColumn } = useColumns(workspaceID, activeTabId);

    const columnIDs = columns.map(c => c.id);
    const { lists, addList, updateList, reorderLists, deleteList } = useLists(columnIDs);

    const listIDs = lists.map(l => l.id);
    const { tasks, addTask, updateTask, deleteTask, reorderTasks } = useTasks(listIDs);

    // ui state
    const [activeTask, setActiveTask] = useState(null);
    const [focusedListId, setFocusedListId] = useState(null);

    const topbarRef = useRef(null);
    const boardRef = useRef(null);

    // animations
    const { registerElement: registerTaskElement, snapshot: snapshotTasks } = useFlipAnimation(tasks);
    const { registerElement: registerListElement, snapshot: snapshotLists } = useFlipAnimation(lists);
    
    const { triggerRemoval: triggerTaskRemoval, isRemoving: isTaskRemoving } = useAnimatedRemoval(deleteTask);
    const { triggerRemoval: triggerListRemoval, isRemoving: isListRemoving } = useAnimatedRemoval(handleDeleteList);

    // layout handlers
    async function handleReorderLists(updates) {
        if (!updates || updates.length === 0) return;

        snapshotLists();
        await reorderLists(updates);
    }

    async function handleDeleteList(listID) {
        if (!lists.some(l => l.id === listID)) return;

        snapshotLists();
        await deleteList(listID);
    }

    // drag and drop handlers
    const {
        dragging,
        dragType,
        cloneMeta,
        insertionPoint,
        isOverDeleteZone,
        registerList,
        registerTask,
        registerGhost,
        registerDeleteZone,
        registerCloneOuter,
        registerCloneInner,
        startDrag,
    } = useDragDrop({
        tasks,
        lists,
        columns,
        onReorderTasks: updates => {
            snapshotTasks();
            reorderTasks(updates);
        },
        onReorderLists: handleReorderLists,
        onDeleteDrop: (item, type) => {
            if (type === 'task') triggerTaskRemoval(item.id);
            else if (type === 'list') triggerListRemoval(item.id);
        },
        onGhostDrop: async (key, item) => {
            const isListDrop = item?.columnID !== undefined;
            const isNewColumn = key === "new-column";

            let columnID;

            if (isNewColumn) {
                columnID = await addColumn(columns.length);
                if (!columnID) return;
            } else {
                const indexFromKey = key.startsWith("ghost-task-col-")
                    ? parseInt(key.replace("ghost-task-col-", ""))
                    : key.startsWith("ghost-list-col-")
                    ? parseInt(key.replace("ghost-list-col-", ""))
                    : parseInt(key.replace("ghost-col-", "")); 

                const existingColumn = columns.find(c => c.columnIndex === indexFromKey);
                columnID = existingColumn?.id;
                if (!columnID) return;
            }

            if (isListDrop) {
                handleReorderLists([{ id: item.id, columnID, listOrder: 0 }]);
                return;
            }

            const listID = await addList(columnID);
            if (!listID) return;

            reorderTasks([{ id: item.id, listID, taskOrder: 0 }]);
        },
    });

    const isDragging = !!dragging;
    const draggingTask = dragType === 'task' ? tasks.find(t => t.id === dragging) : null;
    const draggingList = dragType === 'list' ? lists.find(l => l.id === dragging) : null;

    // visual calculation functions
    const columnCount = columns.length;
    const plusButtonCount = columnCount + 1;
    const boardInnerWidth = columnCount * (300 + 16) + 24 + (isDragging ? 316 : 0);

    function handleBoardScroll() {
        if (topbarRef.current && boardRef.current) {
            topbarRef.current.scrollLeft = boardRef.current.scrollLeft;
        }
    }

    async function handleAddColumn(columnIndex) {
        const existingColumn = columns.find(c => c.columnIndex === columnIndex);

        const columnID = existingColumn
            ? existingColumn.id
            : await addColumn(columnIndex);

        if (!columnID) return;

        const listID = await addList(columnID);
        if (listID) setFocusedListId(listID);
    }

    const tasksByListID = useMemo(() => {
        const map = {};
        for (const task of tasks) {
            if (!map[task.listID]) map[task.listID] = [];
            map[task.listID].push(task);
        }
        return map;
    }, [tasks]);

    const listsByColumnID = useMemo(() => {
        const map = {};
        for (const list of lists) {
            if (!map[list.columnID]) map[list.columnID] = [];
            map[list.columnID].push(list);
        }
        return map;
    }, [lists]);

    return (
        <div className="kanban-root">
            <KanbanTabs
                tabs={tabs}
                activeTabId={activeTabId}
                onSelect={setActiveTabId}
                onAdd={addTab}
                onUpdate={updateTab}
                onArchive={archiveTab}
                onDelete={deleteTab}
            />

            <div className="kanban-topbar" ref={topbarRef}>
                {canEdit && Array.from({ length: plusButtonCount }).map((_, i) => (
                    <button
                        key={i}
                        className="kanban-add-col-btn"
                        onClick={() => handleAddColumn(i)}
                    >
                        +
                    </button>
                ))}
            </div>

            <div className="kanban-board" ref={boardRef} onScroll={handleBoardScroll}>
                <div style={{ position: "relative", width: boardInnerWidth, minHeight: "100%" }}>

                    {columns.map(column => (
                        <KanbanColumn
                            key={column.id}
                            column={column}
                            lists={listsByColumnID[column.id] ?? []}
                            tasksByListID={tasksByListID}
                            categories={categories}
                            focusedListId={focusedListId}
                            dragging={dragging}
                            dragType={dragType}
                            insertionPoint={insertionPoint}
                            isDraggingTaskToEmptyCol={isDragging && dragType === 'task'}
                            isTaskRemoving={isTaskRemoving}
                            isListRemoving={isListRemoving}
                            canEdit={canEdit}
                            onAddTask={(listID) => {
                                const list = lists.find(l => l.id === listID);
                                addTask(listID, list?.category, list?.color);
                            }}
                            onUpdateList={updateList}
                            onUpdateTask={updateTask}
                            onStartTaskDrag={(e, task, el) => startDrag(e, task, el, 'task')}
                            onStartListDrag={(e, list, el) => {
                                registerListElement(list.id, el);
                                startDrag(e, list, el, 'list');
                            }}
                            onOpenTask={setActiveTask}
                            onFocusClear={() => setFocusedListId(null)}
                            registerList={registerList}
                            registerTask={registerTask}
                            registerGhost={registerGhost}
                            registerTaskElement={registerTaskElement}
                            registerListElement={registerListElement}
                        />
                    ))}

                    {isDragging && (
                        <div
                            className="kanban-ghost-column"
                            ref={el => registerGhost("new-column", el)}
                            style={{
                                position: "absolute",
                                top: 0,
                                left: columnCount * (300 + 16),
                            }}
                        >
                            <span>+ New column</span>
                        </div>
                    )}
                </div>
            </div>

            {cloneMeta && (draggingTask || draggingList) && (
                <div
                    ref={registerCloneOuter}
                    style={{
                        position: "fixed",
                        left: 0,
                        top: 0,
                        width: cloneMeta.width,
                        pointerEvents: "none",
                        zIndex: 1002,
                        willChange: "transform",
                    }}
                >
                    <div ref={registerCloneInner} className="kanban-drag-clone">
                        {dragType === 'task' && draggingTask && (
                            <KanbanTask
                                task={draggingTask}
                                categories={categories}
                                isClone={true}
                                onUpdate={() => {}}
                                onStartDrag={() => {}}
                                onOpen={() => {}}
                            />
                        )}
                        {dragType === 'list' && draggingList && (
                            <div className="kanban-list is-clone" style={{ width: cloneMeta.width }}>
                                <div className="kanban-list-header">
                                    <span className="kanban-list-name" style={{ flex: 1 }}>
                                        {draggingList.name}
                                    </span>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            <DeleteDropZone
                visible={isDragging}
                isOver={isOverDeleteZone}
                registerDeleteZone={registerDeleteZone}
            />

            {activeTask && (
                <TaskModal
                    task={activeTask}
                    categories={categories}
                    onSave={changes => {
                        updateTask(activeTask.id, changes);
                        setActiveTask(null);
                    }}
                    onClose={() => setActiveTask(null)}
                />
            )}
        </div>
    );
}