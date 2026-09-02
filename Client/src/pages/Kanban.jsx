// imports
import { useState, useRef, useMemo } from "react";
import { useParams } from "react-router-dom";
import { useKanban } from "../contexts/KanbanContext";
import { useColumns } from "../hooks/useColumns";
import { useLists } from "../hooks/useLists";
import { useTasks } from "../hooks/useTasks";
import { useTabs } from "../hooks/useTabs";
import { useAuth } from '../contexts/AuthContext';
import { useWorkspacePresence } from "../hooks/useWorkspacePresence";
import { useDragDrop } from "../hooks/useDragDrop";
import { useFlipAnimation } from "../hooks/useFlipAnimation";
import { useAnimatedRemoval } from "../hooks/useAnimatedRemoval";
import KanbanTabs from "../components/kanban/KanbanTabs";
import KanbanColumn from "../components/kanban/KanbanColumn";
import KanbanTask from "../components/kanban/KanbanTask";
import TaskModal from "../components/kanban/TaskModal";
import DeleteDropZone from "../components/kanban/DeleteDropZone";
import ConfirmModal from "../components/kanban/ConfirmModal";
import BoardContextMenu from "../components/kanban/BoardContextMenu";
import { Plus, Copy, CheckCheck, RotateCcw, UserPlus, UserMinus, SquarePen, Trash2, ListPlus, Columns3 } from "lucide-react";

// page component
export default function Kanban() {
    const { workspaceID } = useParams();
    const { user } = useAuth();
    const { canEdit, boardData } = useKanban();
    
    // data layer
    const { members } = useWorkspacePresence(workspaceID);
    const {
        tabs,
        tabGroups,
        activeTabId,
        setActiveTabId,
        addTab,
        updateTab,
        archiveTab,
        deleteTab,
        reorderTabs,
        addTabGroup,
        updateTabGroup,
        deleteTabGroup
    } = useTabs(workspaceID);
    const { columns, addColumn } = useColumns(workspaceID, activeTabId);

    const columnIDs = columns.map(c => c.id);
    const { lists, addList, updateList, reorderLists, moveListToNewColumn, deleteList, setListTags } = useLists(columnIDs);

    const listIDs = lists.map(l => l.id);
    const { tasks, addTask, updateTask, duplicateTask, deleteTask, reorderTasks, setTaskTags } = useTasks(listIDs);

    const activeTab = tabs.find(t => t.id === activeTabId) ?? null;
    const activeGroupID = activeTab?.groupID ?? null;

    const tags = useMemo(() => boardData.tags.filter(tag => {
        if (tag.tabID) return tag.tabID === activeTabId;
        if (tag.groupID) return tag.groupID === activeGroupID;
        return true;
    }), [boardData.tags, activeTabId, activeGroupID]);

    // ui state
    const [activeTaskId, setActiveTaskId] = useState(null);
    const activeTask = useMemo(
        () => tasks.find(t => t.id === activeTaskId) ?? null,
        [tasks, activeTaskId]
    );
    const [pendingCombine, setPendingCombine] = useState(null);
    const [focusedListId, setFocusedListId] = useState(null);
    const [focusedTaskId, setFocusedTaskId] = useState(null);
    const [menu, setMenu] = useState(null);

    const topbarRef = useRef(null);
    const boardRef = useRef(null);

    // animations
    const { registerElement: registerTaskElement, snapshot: snapshotTasks } = useFlipAnimation(tasks);
    const { registerElement: registerListElement, snapshot: snapshotLists } = useFlipAnimation(lists);
    
    const { triggerRemoval: triggerTaskRemoval, isRemoving: isTaskRemoving } = useAnimatedRemoval(deleteTask);
    const { triggerRemoval: triggerListRemoval, isRemoving: isListRemoving } = useAnimatedRemoval(handleDeleteList);

    // tag scope handlers
    function privateTagCount(tabIDs) {
        const scope = new Set(tabIDs);
        return boardData.tags.filter(tag => tag.tabID && scope.has(tag.tabID)).length;
    }

    function handleCreateGroup(tabIDs) {
        const count = privateTagCount(tabIDs);

        if (count === 0) {
            addTabGroup(tabIDs, undefined, undefined, false);
            return;
        }

        setPendingCombine({ kind: 'create', tabIDs, count });
    }

    function handleReorderTabs(updates) {
        const joining = updates
            .filter(update => update.groupID)
            .filter(update => tabs.find(t => t.id === update.id)?.groupID !== update.groupID)
            .map(update => update.id);

        const count = joining.length > 0 ? privateTagCount(joining) : 0;

        if (count === 0) {
            reorderTabs(updates, false);
            return;
        }

        setPendingCombine({ kind: 'reorder', updates, count });
    }

    function resolveCombine(combineTags) {
        if (!pendingCombine) return;

        if (pendingCombine.kind === 'create') {
            addTabGroup(pendingCombine.tabIDs, undefined, undefined, combineTags);
        } else {
            reorderTabs(pendingCombine.updates, combineTags);
        }

        setPendingCombine(null);
    }

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
        registerColumn,
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
        onMoveListToColumn: async (listID, columnIndex) => {
            snapshotLists();
            await moveListToNewColumn(listID, columnIndex);
        },
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

    async function handleAddTask(listID) {
        const taskID = await addTask(listID);
        if (taskID) setFocusedTaskId(taskID);
    }

    function openMenu(event, kind, target) {
        setMenu({ kind, target, x: event.clientX, y: event.clientY });
    }

    function menuItems() {
        if (!menu) return [];

        if (menu.kind === 'task') {
            const task = tasks.find(t => t.id === menu.target.id) ?? menu.target;
            const mine = (task.assignedUsers ?? []).includes(user?.id);

            return [
                { key: 'duplicate', label: 'Duplicate task', icon: <Copy size={14} strokeWidth={2} />, onSelect: () => duplicateTask(task.id) },
                { key: 'open', label: 'Open task', icon: <SquarePen size={14} strokeWidth={2} />, onSelect: () => setActiveTaskId(task.id) },
                { key: 'sep1', separator: true },
                {
                    key: 'complete',
                    label: task.isCompleted ? 'Mark as not done' : 'Mark as done',
                    icon: task.isCompleted
                        ? <RotateCcw size={14} strokeWidth={2} />
                        : <CheckCheck size={14} strokeWidth={2} />,
                    onSelect: () => updateTask(task.id, { isCompleted: !task.isCompleted })
                },
                {
                    key: 'assign',
                    label: mine ? 'Unassign me' : 'Assign to me',
                    icon: mine
                        ? <UserMinus size={14} strokeWidth={2} />
                        : <UserPlus size={14} strokeWidth={2} />,
                    disabled: !user?.id,
                    onSelect: () => updateTask(task.id, {
                        assignedUsers: mine
                            ? (task.assignedUsers ?? []).filter(id => id !== user.id)
                            : [...(task.assignedUsers ?? []), user.id]
                    })
                },
                { key: 'sep2', separator: true },
                { key: 'delete', label: 'Delete task', danger: true, icon: <Trash2 size={14} strokeWidth={2} />, onSelect: () => triggerTaskRemoval(task.id) }
            ];
        }

        const list = menu.target;
        const listTasks = tasks.filter(t => t.listID === list.id);
        const done = listTasks.filter(t => t.isCompleted);

        return [
            { key: 'addtask', label: 'Add task', icon: <Plus size={14} strokeWidth={2} />, onSelect: () => handleAddTask(list.id) },
            { key: 'rename', label: 'Rename list', icon: <SquarePen size={14} strokeWidth={2} />, onSelect: () => setFocusedListId(list.id) },
            { key: 'sep1', separator: true },
            { key: 'addlist', label: 'Add list to this column', icon: <ListPlus size={14} strokeWidth={2} />, onSelect: () => addList(list.columnID) },
            { key: 'addcol', label: 'Add column at the end', icon: <Columns3 size={14} strokeWidth={2} />, onSelect: () => handleAddColumn(columns.length) },
            { key: 'sep2', separator: true },
            {
                key: 'clear',
                label: done.length > 0 ? `Delete ${done.length} completed` : 'No completed tasks',
                icon: <CheckCheck size={14} strokeWidth={2} />,
                disabled: done.length === 0,
                onSelect: () => done.forEach(task => triggerTaskRemoval(task.id))
            },
            { key: 'delete', label: 'Delete list', danger: true, icon: <Trash2 size={14} strokeWidth={2} />, onSelect: () => triggerListRemoval(list.id) }
        ];
    }

    function handleFocusClear() {
        setFocusedListId(null);
        setFocusedTaskId(null);
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
                tabGroups={tabGroups}
                workspaceID={workspaceID}
                activeTabId={activeTabId}
                onSelect={setActiveTabId}
                onAdd={addTab}
                onUpdate={updateTab}
                onArchive={archiveTab}
                onDelete={deleteTab}
                onReorder={handleReorderTabs}
                onCreateGroup={handleCreateGroup}
                onUpdateGroup={updateTabGroup}
                onDeleteGroup={deleteTabGroup}
            />

            <div className="kanban-topbar" ref={topbarRef}>
                {canEdit && Array.from({ length: plusButtonCount }).map((_, i) => (
                    <button
                        key={i}
                        className="kanban-add-col-btn"
                        onClick={() => handleAddColumn(i)}
                    >
                        <Plus size={15} strokeWidth={2} />
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
                            tags={tags}
                            members={members}
                            focusedListId={focusedListId}
                            focusedTaskId={focusedTaskId}
                            dragging={dragging}
                            dragType={dragType}
                            insertionPoint={insertionPoint}
                            isDraggingTaskToEmptyCol={isDragging && dragType === 'task'}
                            isTaskRemoving={isTaskRemoving}
                            isListRemoving={isListRemoving}
                            canEdit={canEdit}
                            onAddTask={handleAddTask}
                            onUpdateList={updateList}
                            onSetListTags={setListTags}
                            onUpdateTask={updateTask}
                            onSetTaskTags={setTaskTags}
                            onStartTaskDrag={(e, task, el) => startDrag(e, task, el, 'task')}
                            onStartListDrag={(e, list, el) => {
                                registerListElement(list.id, el);
                                startDrag(e, list, el, 'list');
                            }}
                            onOpenTask={task => setActiveTaskId(task.id)}
                            onFocusClear={handleFocusClear}
                            onTaskContextMenu={canEdit ? (e, task) => openMenu(e, 'task', task) : undefined}
                            onListContextMenu={canEdit ? (e, list) => openMenu(e, 'list', list) : undefined}
                            registerList={registerList}
                            registerTask={registerTask}
                            registerColumn={registerColumn}
                            registerGhost={registerGhost}
                            registerTaskElement={registerTaskElement}
                            registerListElement={registerListElement}
                        />
                    ))}

                    {insertionPoint?.type === 'column' && (
                        <div
                            className="kanban-column-insertion-indicator"
                            style={{ left: insertionPoint.columnIndex * (300 + 16) - 10 }}
                        />
                    )}

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
                            <span><Plus size={14} strokeWidth={2} />New column</span>
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
                                tags={tags}
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

            <BoardContextMenu
                open={!!menu}
                x={menu?.x ?? 0}
                y={menu?.y ?? 0}
                heading={menu?.kind === 'task' ? menu.target.title : menu?.target?.name}
                items={menuItems()}
                onClose={() => setMenu(null)}
            />

            <ConfirmModal
                open={!!pendingCombine}
                title="Combine tags?"
                message={
                    pendingCombine
                        ? `${pendingCombine.count} private tag${pendingCombine.count === 1 ? '' : 's'} belong to the tab${pendingCombine.kind === 'create' && pendingCombine.tabIDs.length === 1 ? '' : 's'} joining this group. Share them with the whole group, or keep them private to their own tab? Public tags are not affected.`
                        : ''
                }
                confirmLabel="Combine tags"
                cancelLabel="Keep private"
                destructive={false}
                onConfirm={() => resolveCombine(true)}
                onCancel={() => resolveCombine(false)}
            />

            {activeTask && (
                <TaskModal
                    task={activeTask}
                    tags={tags}
                    members={members}
                    onSetTags={tagIDs => setTaskTags(activeTask.id, tagIDs)}
                    onChange={changes => updateTask(activeTask.id, changes)}
                    onClose={() => setActiveTaskId(null)}
                />
            )}
        </div>
    );
}