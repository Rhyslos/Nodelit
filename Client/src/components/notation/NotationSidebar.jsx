import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useNotationSidebar } from '../../hooks/useNotationSidebar';
import ContextMenu, { ContextMenuItem, ContextMenuDivider, ContextMenuLabel } from './ContextMenu';
import SidebarSearch from './SidebarSearch';
import ColorPickerPopover from '../colorpicker/ColorPickerPopover';
import { PASTEL_PALETTE } from '../../lib/color';
import { usePalette } from '../../hooks/usePalette';
import { descendantsOf, groupDepthOf } from '../../hooks/useNotationSidebar';
import GroupTreePicker from './GroupTreePicker';

// configuration constants
const MAX_GROUP_DEPTH = 3;
const INDENT_STEP = 12;

// utility functions
function selectContents(element) {
    if (!element) return;

    requestAnimationFrame(() => {
        element.focus();

        const range = document.createRange();
        range.selectNodeContents(element);

        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
    });
}

function useDismiss(active, onDismiss) {
    useEffect(() => {
        if (!active) return undefined;

        document.addEventListener('mousedown', onDismiss);
        window.addEventListener('scroll', onDismiss, true);
        window.addEventListener('resize', onDismiss);

        return () => {
            document.removeEventListener('mousedown', onDismiss);
            window.removeEventListener('scroll', onDismiss, true);
            window.removeEventListener('resize', onDismiss);
        };
    }, [active, onDismiss]);
}

// row components
function PageRow({
    page,
    list,
    isActive,
    canEdit,
    canDrag,
    isEditing,
    isDragged,
    dropPosition,
    onSelect,
    onStartEditing,
    onCommitTitle,
    onDragStart,
    onDragOver,
    onDragLeave,
    onDrop,
    onContextMenu
}) {
    const titleRef = useRef(null);

    useEffect(() => {
        if (isEditing) selectContents(titleRef.current);
    }, [isEditing]);

    function handleKeyDown(event) {
        if (event.key === 'Enter') {
            event.preventDefault();
            titleRef.current?.blur();
        }

        if (event.key === 'Escape') {
            if (titleRef.current) titleRef.current.textContent = page.title;
            titleRef.current?.blur();
        }
    }

    function handleBlur() {
        const text = titleRef.current?.textContent.trim();

        if (text && text !== page.title) onCommitTitle(page.id, text);
        else if (titleRef.current) titleRef.current.textContent = page.title;

        onStartEditing(null);
    }

    return (
        <div className="notation-sidebar-page-wrapper">
            {dropPosition === 'before' && <div className="notation-drop-indicator" />}

            <div
                className={`notation-sidebar-page ${isActive ? 'active' : ''} ${isDragged ? 'dragging' : ''}`}
                draggable={canDrag && !isEditing}
                onDragStart={event => onDragStart(event, page.id)}
                onDragOver={event => onDragOver(event, page.id)}
                onDragLeave={onDragLeave}
                onDrop={event => onDrop(event, page, list)}
                onContextMenu={event => onContextMenu(event, page)}
                onClick={() => { if (!isEditing) onSelect(page.id); }}
                onDoubleClick={() => {
                    if (!canEdit) return;
                    onStartEditing(page.id);
                }}
            >
                <span className="notation-sidebar-dot" />
                <span
                    ref={titleRef}
                    className="notation-sidebar-page-title"
                    contentEditable={isEditing}
                    suppressContentEditableWarning
                    onBlur={handleBlur}
                    onKeyDown={handleKeyDown}
                    onClick={event => { if (isEditing) event.stopPropagation(); }}
                >
                    {page.title}
                </span>
            </div>

            {dropPosition === 'after' && <div className="notation-drop-indicator" />}
        </div>
    );
}

function GroupHeader({
    group,
    isCollapsed,
    canEdit,
    canDrag,
    isEditing,
    isDragged,
    dropPosition,
    onToggle,
    onStartEditing,
    onCommitName,
    onColorClick,
    onAddPage,
    onContextMenu,
    onDragStart,
    onDragOver,
    onDragLeave,
    onDrop
}) {
    const nameRef = useRef(null);
    const colorRef = useRef(null);

    useEffect(() => {
        if (isEditing) selectContents(nameRef.current);
    }, [isEditing]);

    function handleKeyDown(event) {
        if (event.key === 'Enter') {
            event.preventDefault();
            nameRef.current?.blur();
        }

        if (event.key === 'Escape') {
            if (nameRef.current) nameRef.current.textContent = group.name;
            nameRef.current?.blur();
        }
    }

    function handleBlur() {
        const text = nameRef.current?.textContent.trim();

        if (text && text !== group.name) onCommitName(group.id, text);
        else if (nameRef.current) nameRef.current.textContent = group.name;

        onStartEditing(null);
    }

    return (
        <div
            className={`notation-sidebar-group-header ${isDragged ? 'dragging' : ''}`}
            draggable={canDrag && !isEditing}
            onDragStart={event => onDragStart(event, group.id)}
            onDragOver={event => onDragOver(event, group.id)}
            onDragLeave={onDragLeave}
            onDrop={event => onDrop(event, group.id)}
            onContextMenu={event => onContextMenu(event, group)}
            onClick={() => { if (!isEditing) onToggle(group.id); }}
            onDoubleClick={() => {
                if (!canEdit) return;
                onStartEditing(group.id);
            }}
        >
            {dropPosition === 'inside' && <div className="notation-drop-indicator inside" />}
            {dropPosition === 'before' && <div className="notation-drop-indicator" />}

            <div className="notation-sidebar-group-pill" style={group.color ? { background: group.color } : undefined}>
                <span className="notation-sidebar-arrow">{isCollapsed ? '▸' : '▾'}</span>

                <span
                    ref={nameRef}
                    className="notation-sidebar-group-name"
                    contentEditable={isEditing}
                    suppressContentEditableWarning
                    onBlur={handleBlur}
                    onKeyDown={handleKeyDown}
                    onClick={event => { if (isEditing) event.stopPropagation(); }}
                >
                    {group.name}
                </span>

                {canEdit && (
                    <>
                        <button
                            ref={colorRef}
                            className="notation-sidebar-group-color-btn"
                            onClick={event => {
                                event.stopPropagation();
                                onColorClick(group.id, colorRef.current);
                            }}
                        >
                            ●
                        </button>

                        <button
                            className="notation-sidebar-group-add"
                            onClick={event => {
                                event.stopPropagation();
                                onAddPage(group.id);
                            }}
                        >
                            +
                        </button>
                    </>
                )}
            </div>

            {dropPosition === 'after' && <div className="notation-drop-indicator" />}
        </div>
    );
}

// sidebar component
export default function NotationSidebar({ activePageID, onPageSelect }) {
    // state hooks
    const {
        groups,
        pages,
        loading,
        error,
        actionError,
        canEdit,
        createGroup,
        renameGroup,
        colorGroup,
        moveGroup,
        createPage,
        renamePage,
        deletePage,
        deleteGroup,
        reorderPages,
        reorderGroups,
        searchContent
    } = useNotationSidebar();

    const [query, setQuery] = useState('');
    const [mode, setMode] = useState('quick');
    const [contentMatches, setContentMatches] = useState(null);
    const [searching, setSearching] = useState(false);
    const [searchError, setSearchError] = useState(null);

    const [collapsedGroups, setCollapsedGroups] = useState(new Set());
    const [editingGroupID, setEditingGroupID] = useState(null);
    const [editingPageID, setEditingPageID] = useState(null);


    const [colorPickerID, setColorPickerID] = useState(null);
    const [moveTarget, setMoveTarget] = useState(null);
    const [moveDestination, setMoveDestination] = useState(null);
    const [pickerRect, setPickerRect] = useState(null);

    const [contextTarget, setContextTarget] = useState(null);
    const [confirmingDelete, setConfirmingDelete] = useState(false);

    const [draggedPageID, setDraggedPageID] = useState(null);
    const [dropTargetID, setDropTargetID] = useState(null);
    const [dropPosition, setDropPosition] = useState(null);

    const [draggedGroupID, setDraggedGroupID] = useState(null);
    const [groupDropID, setGroupDropID] = useState(null);
    const [groupDropPosition, setGroupDropPosition] = useState(null);

    // search effects
    const term = query.trim();
    const isSearching = term.length > 0;

    useEffect(() => {
        if (mode !== 'thorough' || term.length === 0) {
            setContentMatches(null);
            setSearchError(null);
            setSearching(false);
            return undefined;
        }

        const controller = new AbortController();
        let active = true;

        setSearching(true);

        const timer = setTimeout(() => {
            searchContent(term, controller.signal)
                .then(ids => {
                    if (!active) return;
                    setContentMatches(new Set(ids));
                    setSearchError(null);
                })
                .catch(err => {
                    if (!active || err.name === 'AbortError') return;
                    setContentMatches(null);
                    setSearchError(err.message ?? 'Search failed');
                })
                .finally(() => {
                    if (active) setSearching(false);
                });
        }, 300);

        return () => {
            active = false;
            controller.abort();
            clearTimeout(timer);
        };
    }, [term, mode]);

    // data derived
    const groupIDs = new Set(groups.map(group => group.id));
    const activeGroupColor = groups.find(group => group.id === colorPickerID)?.color ?? null;
    const needle = term.toLowerCase();

    function pageMatches(page) {
        if (!isSearching) return true;
        if (page.title.toLowerCase().includes(needle)) return true;
        return mode === 'thorough' && Boolean(contentMatches?.has(page.id));
    }

    function groupMatches(group) {
        if (!isSearching) return true;
        return group.name.toLowerCase().includes(needle);
    }

    const visiblePages = pages.filter(pageMatches);

    const uncategorized = visiblePages.filter(page => !page.groupID || !groupIDs.has(page.groupID));

    const visibleGroups = groups.filter(group =>
        groupMatches(group) || visiblePages.some(page => page.groupID === group.id));

    // render functions
                function renderGroup(group, depth) {
                    const groupPages = visiblePages.filter(page => page.groupID === group.id);
                    const isCollapsed = !isSearching && collapsedGroups.has(group.id);

        return (
                        <div
                            key={group.id}
                            className="notation-sidebar-group"
                            style={depth > 0 ? { paddingLeft: INDENT_STEP } : undefined}
                            onDragOver={handleDragOverGroup}
                            onDrop={event => handleDropOnGroup(event, group.id, groupPages)}
                        >
                            <GroupHeader
                                group={group}
                                isCollapsed={isCollapsed}
                                canEdit={canEdit}
                                canDrag={canEdit && !isSearching}
                                isEditing={editingGroupID === group.id}
                                onToggle={toggleGroup}
                                onStartEditing={setEditingGroupID}
                                onCommitName={renameGroup}
                                onColorClick={handleColorClick}
                                onAddPage={handleAddPage}
                                onContextMenu={handleGroupContext}
                                isDragged={draggedGroupID === group.id}
                                dropPosition={groupDropID === group.id ? groupDropPosition : null}
                                onDragStart={handleGroupDragStart}
                                onDragOver={handleGroupDragOver}
                                onDragLeave={() => setGroupDropID(null)}
                                onDrop={handleGroupDrop}
                            />

                            {!isCollapsed && (
                                <div className="notation-sidebar-group-pages">
                                    {groupPages.map(page => (
                                        <PageRow
                                            key={page.id}
                                            page={page}
                                            list={groupPages}
                                            isActive={page.id === activePageID}
                                            canEdit={canEdit}
                                            canDrag={canEdit && !isSearching}
                                            isEditing={editingPageID === page.id}
                                            isDragged={draggedPageID === page.id}
                                            dropPosition={dropTargetID === page.id ? dropPosition : null}
                                            onSelect={onPageSelect}
                                            onStartEditing={setEditingPageID}
                                            onCommitTitle={renamePage}
                                            onDragStart={handleDragStart}
                                            onDragOver={handleDragOverPage}
                                            onDragLeave={handleDragLeavePage}
                                            onDrop={handleDropOnPage}
                                            onContextMenu={handlePageContext}
                                        />
                                    ))}
                                </div>
                            )}

                            {!isCollapsed && renderGroups(group.id, depth + 1)}
                        </div>
                    );
    }

    function renderGroups(parentID, depth) {
        return visibleGroups
            .filter(group => (group.parentID ?? null) === parentID)
            .sort((a, b) => a.groupOrder - b.groupOrder || a.id.localeCompare(b.id))
            .map(group => renderGroup(group, depth));
    }

    // group handlers
    function toggleGroup(groupID) {
        setCollapsedGroups(previous => {
            const next = new Set(previous);
            if (next.has(groupID)) next.delete(groupID);
            else next.add(groupID);
            return next;
        });
    }

    function handleColorClick(groupID, element) {
        if (colorPickerID === groupID) {
            setColorPickerID(null);
            return;
        }

        setPickerRect(element.getBoundingClientRect());
        setColorPickerID(groupID);
    }

    async function handleAddPage(groupID) {
        const page = await createPage('Untitled', groupID);
        if (!page) return;

        onPageSelect(page.id);
        setEditingPageID(page.id);
    }

    // drag handlers
    function handleDragStart(event, pageID) {
        setDraggedPageID(pageID);
        event.dataTransfer.effectAllowed = 'move';
    }

    function handleDragOverGroup(event) {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
    }

    function handleDragOverPage(event, targetPageID) {
        event.preventDefault();
        event.stopPropagation();
        event.dataTransfer.dropEffect = 'move';

        if (draggedPageID === targetPageID) {
            setDropTargetID(null);
            setDropPosition(null);
            return;
        }

        const rect = event.currentTarget.getBoundingClientRect();
        const midpoint = rect.top + rect.height / 2;

        setDropTargetID(targetPageID);
        setDropPosition(event.clientY < midpoint ? 'before' : 'after');
    }

    function handleDragLeavePage(event) {
        if (event.currentTarget.contains(event.relatedTarget)) return;
        setDropTargetID(null);
        setDropPosition(null);
    }

    function resetDrag() {
        setDraggedPageID(null);
        setDropTargetID(null);
        setDropPosition(null);
    }

    function resetGroupDrag() {
        setDraggedGroupID(null);
        setGroupDropID(null);
        setGroupDropPosition(null);
    }

    function handleGroupDragStart(event, groupID) {
        event.stopPropagation();
        setDraggedGroupID(groupID);
        event.dataTransfer.effectAllowed = 'move';
    }

    function handleGroupDragOver(event, targetGroupID) {
        if (!draggedGroupID) return;

        event.preventDefault();
        event.stopPropagation();
        event.dataTransfer.dropEffect = 'move';

        if (draggedGroupID === targetGroupID) {
            setGroupDropID(null);
            setGroupDropPosition(null);
            return;
        }

        if (descendantsOf(groups, draggedGroupID).has(targetGroupID)) {
            setGroupDropID(null);
            setGroupDropPosition(null);
            return;
        }

        const rect = event.currentTarget.getBoundingClientRect();
        const offset = event.clientY - rect.top;

        let position = 'inside';
        if (offset < rect.height * 0.25) position = 'before';
        else if (offset > rect.height * 0.75) position = 'after';

        if (position === 'inside' && groupDepthOf(groups, targetGroupID) >= MAX_GROUP_DEPTH) {
            position = 'after';
        }

        setGroupDropID(targetGroupID);
        setGroupDropPosition(position);
    }

    function handleGroupDrop(event, targetGroupID) {
        if (!draggedGroupID) return;

        event.preventDefault();
        event.stopPropagation();

        const dragged = draggedGroupID;
        const position = groupDropPosition;

        resetGroupDrag();

        if (!dragged || dragged === targetGroupID) return;

        const target = groups.find(group => group.id === targetGroupID);
        if (!target) return;

        if (position === 'inside') {
            const children = groups.filter(group => (group.parentID ?? null) === targetGroupID);
            reorderGroups(dragged, targetGroupID, children.length);
            return;
        }

        const parentID = target.parentID ?? null;

        const siblings = groups
            .filter(group => (group.parentID ?? null) === parentID && group.id !== dragged)
            .sort((a, b) => a.groupOrder - b.groupOrder);

        const anchor = siblings.findIndex(group => group.id === targetGroupID);
        if (anchor === -1) return;

        reorderGroups(dragged, parentID, position === 'after' ? anchor + 1 : anchor);
    }

    function handleDropOnPage(event, targetPage, list) {
        event.preventDefault();
        event.stopPropagation();

        const dragged = draggedPageID;
        const position = dropPosition;
        resetDrag();

        if (!dragged || dragged === targetPage.id) return;

        const remaining = list.filter(page => page.id !== dragged);
        const anchor = remaining.findIndex(page => page.id === targetPage.id);
        if (anchor === -1) return;

        reorderPages(dragged, targetPage.groupID ?? null, position === 'after' ? anchor + 1 : anchor);
    }

    function handleDropOnGroup(event, groupID, groupPages) {
        event.preventDefault();
        event.stopPropagation();

        const dragged = draggedPageID;
        resetDrag();

        if (!dragged) return;

        reorderPages(dragged, groupID, groupPages.filter(page => page.id !== dragged).length);
    }

    const closeColorPicker = useCallback(() => setColorPickerID(null), []);
    const { palette, saveColor, forgetColor } = usePalette();

    const closeContext = useCallback(() => {
        setContextTarget(null);
        setConfirmingDelete(false);
    }, []);

    function openContext(event, kind, entity) {
        if (!canEdit) return;

        event.preventDefault();
        event.stopPropagation();

        setConfirmingDelete(false);
        setContextTarget({ kind, entity, x: event.clientX, y: event.clientY });
    }

    function handlePageContext(event, page) {
        openContext(event, 'page', page);
    }

    function handleGroupContext(event, group) {
        openContext(event, 'group', group);
    }

    function handleSidebarContext(event) {
        if (!canEdit) return;
        if (event.target.closest('.notation-sidebar-page-wrapper')) return;
        if (event.target.closest('.notation-sidebar-group-header')) return;
        if (event.target.closest('.notation-search')) return;

        event.preventDefault();

        setConfirmingDelete(false);
        setContextTarget({ kind: 'sidebar', entity: null, x: event.clientX, y: event.clientY });
    }

    function startRenameFromContext() {
        const { kind, entity } = contextTarget;

        if (kind === 'page') setEditingPageID(entity.id);
        else setEditingGroupID(entity.id);

        closeContext();
    }

    async function confirmDelete() {
        const { kind, entity } = contextTarget;

        closeContext();

        if (kind === 'page') await deletePage(entity.id);
        else await deleteGroup(entity.id);
    }

    async function handleNewPage(groupID = null) {
        const page = await createPage('Untitled', groupID);
        closeContext();

        if (!page) return;

        onPageSelect(page.id);
        setEditingPageID(page.id);
    }

    async function handleNewGroup(parentID = null) {
        const group = await createGroup('New group', parentID);
        closeContext();

        if (!group) return;

        setCollapsedGroups(previous => {
            const next = new Set(previous);
            next.delete(group.id);
            return next;
        });

        setEditingGroupID(group.id);
    }

    // side effects
    useDismiss(Boolean(colorPickerID), closeColorPicker);



    useEffect(() => {
        if (loading || !activePageID) return;
        if (pages.some(page => page.id === activePageID)) return;
        onPageSelect(pages.length > 0 ? pages[0].id : null);
    }, [loading, pages, activePageID, onPageSelect]);

    if (loading) return <div className="notation-sidebar" />;

    // render component
    return (
        <>
            <div
                className="notation-sidebar"
                onContextMenu={handleSidebarContext}
                onDragOver={handleDragOverGroup}
                onDrop={event => handleDropOnGroup(event, null, uncategorized)}
            >
                <SidebarSearch
                    query={query}
                    mode={mode}
                    searching={searching}
                    error={searchError}
                    onQuery={setQuery}
                    onMode={setMode}
                />

                {(error || actionError) && (
                    <div className="notation-sidebar-error">{error?.message ?? actionError}</div>
                )}

                {uncategorized.map(page => (
                    <PageRow
                        key={page.id}
                        page={page}
                        list={uncategorized}
                        isActive={page.id === activePageID}
                        canEdit={canEdit}
                        canDrag={canEdit && !isSearching}
                        isEditing={editingPageID === page.id}
                        isDragged={draggedPageID === page.id}
                        dropPosition={dropTargetID === page.id ? dropPosition : null}
                        onSelect={onPageSelect}
                        onStartEditing={setEditingPageID}
                        onCommitTitle={renamePage}
                        onDragStart={handleDragStart}
                        onDragOver={handleDragOverPage}
                        onDragLeave={handleDragLeavePage}
                        onDrop={handleDropOnPage}
                        onContextMenu={handlePageContext}
                    />
                ))}

                {renderGroups(null, 0)}

            </div>

            {contextTarget && (
                <ContextMenu position={{ x: contextTarget.x, y: contextTarget.y }} onClose={closeContext}>
                    <ContextMenuLabel>
                        {contextTarget.kind === 'sidebar'
                            ? 'Create'
                            : contextTarget.entity.title ?? contextTarget.entity.name}
                    </ContextMenuLabel>

                    {contextTarget.kind === 'sidebar' && (
                        <>
                            <ContextMenuItem onSelect={() => handleNewPage(null)}>
                                New page
                            </ContextMenuItem>

                            <ContextMenuItem onSelect={() => handleNewGroup(null)}>
                                New group
                            </ContextMenuItem>
                        </>
                    )}

                    {contextTarget.kind !== 'sidebar' && (
                        <ContextMenuItem onSelect={startRenameFromContext}>Rename</ContextMenuItem>
                    )}

                    {contextTarget.kind === 'group' && (
                        <>
                            <ContextMenuItem onSelect={() => handleNewPage(contextTarget.entity.id)}>
                                New page in group
                            </ContextMenuItem>

                            <ContextMenuItem
                                disabled={groupDepthOf(groups, contextTarget.entity.id) >= MAX_GROUP_DEPTH}
                                onSelect={() => handleNewGroup(contextTarget.entity.id)}
                            >
                                New subgroup
                            </ContextMenuItem>

                            <ContextMenuItem
                                onSelect={() => {
                                    setPickerPos({ top: contextTarget.y, left: contextTarget.x });
                                    setColorPickerID(contextTarget.entity.id);
                                    closeContext();
                                }}
                            >
                                Colour
                            </ContextMenuItem>
                        </>
                    )}

                    {contextTarget.kind !== 'sidebar' && (
                        <ContextMenuItem
                            onSelect={() => {
                                setMoveTarget(contextTarget);
                                closeContext();
                            }}
                        >
                            Move to…
                        </ContextMenuItem>
                    )}

                    {contextTarget.kind !== 'sidebar' && <ContextMenuDivider />}

                    {contextTarget.kind !== 'sidebar' && !confirmingDelete && (
                        <ContextMenuItem onSelect={() => setConfirmingDelete(true)} danger>
                            {contextTarget.kind === 'page' ? 'Delete page' : 'Delete group'}
                        </ContextMenuItem>
                    )}

                    {contextTarget.kind !== 'sidebar' && confirmingDelete && (
                        <>
                            <ContextMenuLabel>
                                {contextTarget.kind === 'page'
                                    ? 'This permanently deletes the page and its contents'
                                    : 'Pages in this group are kept and moved out'}
                            </ContextMenuLabel>

                            <ContextMenuItem onSelect={confirmDelete} danger>
                                Confirm delete
                            </ContextMenuItem>

                            <ContextMenuItem onSelect={() => setConfirmingDelete(false)}>
                                Cancel
                            </ContextMenuItem>
                        </>
                    )}
                </ContextMenu>
            )}

            {moveTarget && createPortal(
                <div className="notation-modal notation-modal--move" onMouseDown={event => event.stopPropagation()}>
                    <div className="notation-modal-header">
                        <h3>Move {moveTarget.entity.title ?? moveTarget.entity.name}</h3>
                        <button className="notation-modal-close" onClick={() => setMoveTarget(null)}>✕</button>
                    </div>

                    <div className="notation-modal-body">
                        <GroupTreePicker
                            groups={groups}
                            value={moveDestination}
                            onChange={setMoveDestination}
                            disabledID={moveTarget.kind === 'group' ? moveTarget.entity.id : null}
                        />
                    </div>

                    <div className="notation-modal-footer">
                        <button className="notation-btn-secondary" onClick={() => setMoveTarget(null)}>Cancel</button>

                        <button
                            className="notation-btn-primary"
                            onClick={() => {
                                if (moveTarget.kind === 'group') moveGroup(moveTarget.entity.id, moveDestination);
                                else reorderPages(moveTarget.entity.id, moveDestination, 0);

                                setMoveTarget(null);
                                setMoveDestination(null);
                            }}
                        >
                            Move here
                        </button>
                    </div>
                </div>,
                document.body
            )}

            {colorPickerID && (
                <ColorPickerPopover
                    anchorRect={pickerRect}
                    value={activeGroupColor ?? PASTEL_PALETTE[0]}
                    presets={PASTEL_PALETTE}
                    saved={palette}
                    onCommit={color => colorGroup(colorPickerID, color)}
                    onSave={saveColor}
                    onForget={forgetColor}
                    onClose={() => setColorPickerID(null)}
                />
            )}
        </>
    );
}