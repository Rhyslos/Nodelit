// component imports
import { useState, useRef, useEffect, Fragment } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, ChevronRight, Eye, EyeOff, ListFilter } from 'lucide-react';
import TabVisibilityMenu from './TabVisibilityMenu';
import ColorPickerPopover from '../colorpicker/ColorPickerPopover';
import { PASTEL_PALETTE } from '../../lib/color';
import { usePalette } from '../../hooks/usePalette';
import TabContextMenu from './TabContextMenu';
import ConfirmModal from './ConfirmModal';
import { useTabDrag, buildTabSlots } from '../../hooks/useTabDrag';

// configuration constants
const GROUP_STORAGE_PREFIX = 'nodelit:tabgroups:';
const HIDDEN_STORAGE_PREFIX = 'nodelit:hiddentabs:';

// utility functions
function readCollapsedGroups(workspaceID) {
    if (!workspaceID) return new Set();

    try {
        const stored = localStorage.getItem(`${GROUP_STORAGE_PREFIX}${workspaceID}`);
        return new Set(stored ? JSON.parse(stored) : []);
    } catch {
        return new Set();
    }
}

function readHiddenTabs(workspaceID) {
    if (!workspaceID) return new Set();

    try {
        const stored = localStorage.getItem(`${HIDDEN_STORAGE_PREFIX}${workspaceID}`);
        return new Set(stored ? JSON.parse(stored) : []);
    } catch {
        return new Set();
    }
}

function persistHiddenTabs(workspaceID, tabIDs) {
    if (!workspaceID) return;

    try {
        localStorage.setItem(`${HIDDEN_STORAGE_PREFIX}${workspaceID}`, JSON.stringify([...tabIDs]));
    } catch {
        return;
    }
}

function persistCollapsedGroups(workspaceID, groupIDs) {
    if (!workspaceID) return;

    try {
        localStorage.setItem(`${GROUP_STORAGE_PREFIX}${workspaceID}`, JSON.stringify([...groupIDs]));
    } catch {
        return;
    }
}

// component functions
export default function KanbanTabs({
    tabs,
    tabGroups = [],
    workspaceID,
    activeTabId,
    onSelect,
    onAdd,
    onArchive,
    onUpdate,
    onDelete,
    onReorder,
    onCreateGroup,
    onUpdateGroup,
    onDeleteGroup
}) {
    const { palette, saveColor, forgetColor } = usePalette();

    // state variables
    const [collapsedGroups, setCollapsedGroups] = useState(() => readCollapsedGroups(workspaceID));
    const [hiddenTabs, setHiddenTabs] = useState(() => readHiddenTabs(workspaceID));
    const [revealAll, setRevealAll] = useState(false);
    const [visibilityRect, setVisibilityRect] = useState(null);
    const [editingId, setEditingId] = useState(null);
    const [editingColor, setEditingColor] = useState(null);
    const [pickerRect, setPickerRect] = useState(null);
    const [menuTarget, setMenuTarget] = useState(null);
    const [menuPos, setMenuPos] = useState({ x: 0, y: 0 });
    const [confirmTab, setConfirmTab] = useState(null);

    // dom references
    const nameRefs = useRef({});
    const colorBtnRefs = useRef({});
    const groupElements = useRef({});
    const visibilityBtnRef = useRef(null);

    // derived variables
    const visibleTabs = revealAll
        ? tabs
        : tabs.filter(tab => !hiddenTabs.has(tab.id) || tab.id === activeTabId);
    const hiddenCount = tabs.filter(tab => hiddenTabs.has(tab.id)).length;

    const slots = buildTabSlots(visibleTabs, tabGroups);

    const {
        visibleSlots,
        dragging,
        dropTarget,
        registerTab,
        registerGroup,
        registerClone,
        startDrag,
        wasDragging
    } = useTabDrag({ slots, allTabs: tabs, collapsedGroups, onReorder });

    // lifecycle functions
    useEffect(() => {
        setCollapsedGroups(readCollapsedGroups(workspaceID));
        setHiddenTabs(readHiddenTabs(workspaceID));
        setRevealAll(false);
    }, [workspaceID]);

    // visibility handlers
    function commitHidden(next) {
        setHiddenTabs(next);
        persistHiddenTabs(workspaceID, next);
    }

    function toggleTabVisibility(tabID) {
        const next = new Set(hiddenTabs);

        if (next.has(tabID)) next.delete(tabID);
        else next.add(tabID);

        commitHidden(next);
    }

    function toggleGroupVisibility(groupID) {
        const members = tabs.filter(tab => tab.groupID === groupID);
        const allHidden = members.every(tab => hiddenTabs.has(tab.id));
        const next = new Set(hiddenTabs);

        for (const tab of members) {
            if (allHidden) next.delete(tab.id);
            else next.add(tab.id);
        }

        commitHidden(next);
    }

    function showAllTabs() {
        commitHidden(new Set());
        setRevealAll(false);
    }

    function openVisibilityMenu() {
        setVisibilityRect(visibilityRect ? null : visibilityBtnRef.current.getBoundingClientRect());
    }

    // group handlers
    function toggleGroup(groupID) {
        setCollapsedGroups(previous => {
            const next = new Set(previous);

            if (next.has(groupID)) next.delete(groupID);
            else next.add(groupID);

            persistCollapsedGroups(workspaceID, next);

            return next;
        });
    }

    // editing handlers
    function startEditing(id) {
        setEditingId(id);

        const el = nameRefs.current[id];
        if (!el) return;

        requestAnimationFrame(() => {
            el.focus();

            const range = document.createRange();
            range.selectNodeContents(el);

            const selection = window.getSelection();
            if (!selection) return;

            selection.removeAllRanges();
            selection.addRange(range);
        });
    }

    function handleNameBlur(tab) {
        const text = nameRefs.current[tab.id]?.textContent.trim();

        if (text && text !== tab.name) {
            onUpdate(tab.id, { name: text });
        } else if (nameRefs.current[tab.id]) {
            nameRefs.current[tab.id].textContent = tab.name;
        }

        setEditingId(null);
        setEditingColor(null);
    }

    function handleGroupNameBlur(group) {
        const text = nameRefs.current[group.id]?.textContent.trim();

        if (text && text !== group.name) {
            onUpdateGroup(group.id, { name: text });
        } else if (nameRefs.current[group.id]) {
            nameRefs.current[group.id].textContent = group.name;
        }

        setEditingId(null);
        setEditingColor(null);
    }

    function handleNameKeyDown(e, entity) {
        if (e.key === 'Enter') {
            e.preventDefault();
            nameRefs.current[entity.id]?.blur();
        }

        if (e.key === 'Escape') {
            if (nameRefs.current[entity.id]) nameRefs.current[entity.id].textContent = entity.name;
            nameRefs.current[entity.id]?.blur();
        }
    }

    // colour handlers
    function handleColorBtnClick(e, target) {
        e.stopPropagation();

        if (editingColor?.id === target.id) {
            setEditingColor(null);
            return;
        }

        const btn = colorBtnRefs.current[target.id];
        if (!btn) return;

        setPickerRect(btn.getBoundingClientRect());
        setEditingColor(target);
    }

    function handleColorChange(color) {
        if (!editingColor) return;

        if (editingColor.kind === 'group') onUpdateGroup(editingColor.id, { color });
        else onUpdate(editingColor.id, { color });

        setEditingColor({ ...editingColor, color });
    }

    // drag handlers
    function handleTabMouseDown(e, tab) {
        if (editingId === tab.id) return;
        if (e.target.closest('.kanban-tab-color-btn')) return;

        startDrag(e, { type: 'tab', id: tab.id, tab }, e.currentTarget);
    }

    function handleGroupMouseDown(e, slot) {
        if (editingId === slot.id) return;
        if (e.target.closest('.kanban-tab-color-btn') || e.target.closest('.kanban-tab-group-toggle')) return;

        startDrag(e, { type: 'group', id: slot.id, slot }, groupElements.current[slot.id] ?? e.currentTarget);
    }

    // menu handlers
    function handleContextMenu(e, target) {
        e.preventDefault();

        setMenuTarget(target);
        setMenuPos({ x: e.clientX, y: e.clientY });
    }

    function handleMenuGroup() {
        if (menuTarget?.kind === 'tab') onCreateGroup([menuTarget.tab.id]);
        setMenuTarget(null);
    }

    function handleMenuRemoveFromGroup() {
        if (menuTarget?.kind === 'tab') {
            onReorder([{ id: menuTarget.tab.id, groupID: null, tabOrder: menuTarget.tab.tabOrder }]);
        }

        setMenuTarget(null);
    }

    function handleMenuUngroup() {
        if (menuTarget?.kind === 'group') onDeleteGroup(menuTarget.group.id);
        setMenuTarget(null);
    }

    function handleMenuDelete() {
        setConfirmTab(menuTarget?.tab ?? null);
        setMenuTarget(null);
    }

    function handleMenuArchive() {
        if (menuTarget?.kind === 'tab') onArchive?.(menuTarget.tab.id);
        setMenuTarget(null);
    }

    function handleConfirmDelete() {
        if (confirmTab) onDelete?.(confirmTab.id);
        setConfirmTab(null);
    }

    // render functions
    function renderTab(tab) {
        return (
            <div
                ref={el => registerTab(tab.id, el)}
                className={[
                    'kanban-tab',
                    activeTabId === tab.id ? 'active' : '',
                    hiddenTabs.has(tab.id) ? 'is-revealed' : ''
                ].filter(Boolean).join(' ')}
                onMouseDown={e => handleTabMouseDown(e, tab)}
                onClick={() => {
                    if (wasDragging() || editingId === tab.id) return;
                    onSelect(tab.id);
                }}
                onDoubleClick={() => startEditing(tab.id)}
                onContextMenu={e => handleContextMenu(e, { kind: 'tab', tab })}
                style={{ '--tab-color': tab.color }}
            >
                <span className="kanban-tab-dot" style={{ background: tab.color }} />

                <span
                    ref={el => nameRefs.current[tab.id] = el}
                    className="kanban-tab-name"
                    contentEditable={editingId === tab.id}
                    suppressContentEditableWarning
                    onBlur={() => handleNameBlur(tab)}
                    onKeyDown={e => handleNameKeyDown(e, tab)}
                    onClick={e => { if (editingId === tab.id) e.stopPropagation(); }}
                >
                    {tab.name}
                </span>

                {activeTabId === tab.id && (
                    <div className="kanban-tab-actions">
                        <button
                            ref={el => colorBtnRefs.current[tab.id] = el}
                            className="kanban-tab-color-btn"
                            title="Change colour"
                            onClick={e => handleColorBtnClick(e, { kind: 'tab', id: tab.id, color: tab.color })}
                        >
                            ●
                        </button>
                    </div>
                )}
            </div>
        );
    }

    function renderGroup(slot) {
        const collapsed = collapsedGroups.has(slot.id);
        const isTarget = dropTarget?.groupID === slot.id;
        const holdsActive = slot.tabs.some(tab => tab.id === activeTabId);

        return (
            <div
                ref={el => {
                    groupElements.current[slot.id] = el;
                    registerGroup(slot.id, el);
                }}
                className={[
                    'kanban-tab-group',
                    collapsed ? 'is-collapsed' : '',
                    isTarget ? 'is-drop-target' : '',
                    holdsActive ? 'holds-active' : ''
                ].filter(Boolean).join(' ')}
                style={{ '--group-color': slot.group.color }}
            >
                <div
                    className="kanban-tab-group-head"
                    onMouseDown={e => handleGroupMouseDown(e, slot)}
                    onDoubleClick={() => startEditing(slot.id)}
                    onContextMenu={e => handleContextMenu(e, { kind: 'group', group: slot.group })}
                >
                    <button
                        type="button"
                        className="kanban-tab-group-toggle"
                        title={collapsed ? 'Expand group' : 'Collapse group'}
                        aria-label={collapsed ? 'Expand group' : 'Collapse group'}
                        onClick={() => toggleGroup(slot.id)}
                    >
                        {collapsed
                            ? <ChevronRight size={12} strokeWidth={2.5} />
                            : <ChevronDown size={12} strokeWidth={2.5} />}
                    </button>

                    <span
                        ref={el => nameRefs.current[slot.id] = el}
                        className="kanban-tab-group-name"
                        contentEditable={editingId === slot.id}
                        suppressContentEditableWarning
                        onBlur={() => handleGroupNameBlur(slot.group)}
                        onKeyDown={e => handleNameKeyDown(e, slot.group)}
                    >
                        {slot.group.name}
                    </span>

                    <span className="kanban-tab-group-count">{slot.tabs.length}</span>

                    <button
                        ref={el => colorBtnRefs.current[slot.id] = el}
                        className="kanban-tab-color-btn"
                        title="Change colour"
                        onClick={e => handleColorBtnClick(e, { kind: 'group', id: slot.id, color: slot.group.color })}
                    >
                        ●
                    </button>
                </div>

                {!collapsed && (
                    <div className="kanban-tab-group-tabs">
                        {slot.tabs.map((tab, index) => (
                            <Fragment key={tab.id}>
                                {isTarget && dropTarget.index === index && (
                                    <div className="kanban-tab-insertion-indicator" />
                                )}
                                {renderTab(tab)}
                            </Fragment>
                        ))}

                        {isTarget && dropTarget.index === slot.tabs.length && (
                            <div className="kanban-tab-insertion-indicator" />
                        )}
                    </div>
                )}
            </div>
        );
    }

    // derived variables
    const showTopIndicator = dropTarget && !dropTarget.groupID;

    return (
        <div className="kanban-tabs">
            <div className={`kanban-tabs-strip ${dragging ? 'is-dragging' : ''}`}>
                {visibleSlots.map((slot, index) => (
                    <Fragment key={slot.id}>
                        {showTopIndicator && dropTarget.index === index && (
                            <div className="kanban-tab-insertion-indicator" />
                        )}
                        {slot.type === 'group' ? renderGroup(slot) : renderTab(slot.tab)}
                    </Fragment>
                ))}

                {showTopIndicator && dropTarget.index === visibleSlots.length && (
                    <div className="kanban-tab-insertion-indicator" />
                )}

                <button className="kanban-tab-add-btn" onClick={() => onAdd()} title="New tab">
                    +
                </button>

                <div className="kanban-tabs-tools">
                    {hiddenCount > 0 && !revealAll && (
                        <span className="kanban-tabs-hidden-count">{hiddenCount} hidden</span>
                    )}

                    <button
                        type="button"
                        className={`kanban-tabs-tool ${revealAll ? 'active' : ''}`}
                        title={revealAll ? 'Back to your tabs' : 'Reveal every tab'}
                        aria-label={revealAll ? 'Back to your tabs' : 'Reveal every tab'}
                        onClick={() => setRevealAll(open => !open)}
                    >
                        {revealAll
                            ? <EyeOff size={14} strokeWidth={2} />
                            : <Eye size={14} strokeWidth={2} />}
                    </button>

                    <button
                        ref={visibilityBtnRef}
                        type="button"
                        className={`kanban-tabs-tool ${visibilityRect ? 'active' : ''}`}
                        title="Choose visible tabs"
                        aria-label="Choose visible tabs"
                        onClick={openVisibilityMenu}
                    >
                        <ListFilter size={14} strokeWidth={2} />
                    </button>
                </div>
            </div>

            {visibilityRect && (
                <TabVisibilityMenu
                    anchorRect={visibilityRect}
                    tabs={tabs}
                    tabGroups={tabGroups}
                    hidden={hiddenTabs}
                    onToggleTab={toggleTabVisibility}
                    onToggleGroup={toggleGroupVisibility}
                    onShowAll={showAllTabs}
                    onClose={() => setVisibilityRect(null)}
                />
            )}

            {dragging && createPortal(
                <div ref={registerClone} className="kanban-tab-drag-clone">
                    {dragging.type === 'tab' ? (
                        <div className="kanban-tab active" style={{ '--tab-color': dragging.tab.color }}>
                            <span className="kanban-tab-dot" style={{ background: dragging.tab.color }} />
                            <span className="kanban-tab-name">{dragging.tab.name}</span>
                        </div>
                    ) : (
                        <div
                            className="kanban-tab-group is-collapsed"
                            style={{ '--group-color': dragging.slot.group.color }}
                        >
                            <div className="kanban-tab-group-head">
                                <span className="kanban-tab-group-name">{dragging.slot.group.name}</span>
                                <span className="kanban-tab-group-count">{dragging.slot.tabs.length}</span>
                            </div>
                        </div>
                    )}
                </div>,
                document.body
            )}

            {editingColor && (
                <ColorPickerPopover
                    anchorRect={pickerRect}
                    value={editingColor.color}
                    presets={PASTEL_PALETTE}
                    saved={palette}
                    onCommit={handleColorChange}
                    onSave={saveColor}
                    onForget={forgetColor}
                    onClose={() => setEditingColor(null)}
                />
            )}

            <TabContextMenu
                open={!!menuTarget}
                x={menuPos.x}
                y={menuPos.y}
                onGroup={menuTarget?.kind === 'tab' && !menuTarget.tab.groupID ? handleMenuGroup : null}
                onRemoveFromGroup={menuTarget?.kind === 'tab' && menuTarget.tab.groupID ? handleMenuRemoveFromGroup : null}
                onUngroup={menuTarget?.kind === 'group' ? handleMenuUngroup : null}
                onArchive={menuTarget?.kind === 'tab' && tabs.length > 1 ? handleMenuArchive : null}
                onDelete={menuTarget?.kind === 'tab' && tabs.length > 1 ? handleMenuDelete : null}
                onClose={() => setMenuTarget(null)}
            />

            <ConfirmModal
                open={!!confirmTab}
                title="Delete tab?"
                message={
                    confirmTab
                        ? `"${confirmTab.name}" and all its columns, lists, and tasks will be permanently deleted. This cannot be undone.`
                        : ''
                }
                confirmLabel="Delete"
                cancelLabel="Cancel"
                onConfirm={handleConfirmDelete}
                onCancel={() => setConfirmTab(null)}
            />
        </div>
    );
}
