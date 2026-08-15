// component imports
import { useState, useRef, useEffect, Fragment } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, ChevronRight } from 'lucide-react';
import TabContextMenu from './TabContextMenu';
import ConfirmModal from './ConfirmModal';
import { useKanban } from '../../contexts/KanbanContext';
import { useTabDrag, buildTabSlots } from '../../hooks/useTabDrag';

// configuration constants
const PRESET_COLORS = [
    { color: '#ffb3b3', label: 'Red' },
    { color: '#ffd0a8', label: 'Orange' },
    { color: '#fff0a8', label: 'Yellow' },
    { color: '#b8f0c8', label: 'Green' },
    { color: '#b3d8ff', label: 'Blue' },
    { color: '#ffb3d9', label: 'Pink' },
    { color: '#e8b3ff', label: 'Magenta' }
];

// component functions
export default function KanbanTabs({
    tabs,
    tabGroups = [],
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
    const { collapsedGroups, toggleGroup } = useKanban();

    // state variables
    const [editingId, setEditingId] = useState(null);
    const [editingColor, setEditingColor] = useState(null);
    const [pickerPos, setPickerPos] = useState({ top: 0, left: 0 });
    const [menuTarget, setMenuTarget] = useState(null);
    const [menuPos, setMenuPos] = useState({ x: 0, y: 0 });
    const [confirmTab, setConfirmTab] = useState(null);

    // dom references
    const nameRefs = useRef({});
    const colorBtnRefs = useRef({});
    const groupElements = useRef({});

    // derived variables
    const slots = buildTabSlots(tabs, tabGroups);

    const {
        visibleSlots,
        dragging,
        dropTarget,
        registerTab,
        registerGroup,
        registerClone,
        startDrag,
        wasDragging
    } = useTabDrag({ slots, collapsedGroups, onReorder });

    // lifecycle functions
    useEffect(() => {
        const validIds = new Set([...tabs.map(t => t.id), ...tabGroups.map(g => g.id)]);

        for (const id of Object.keys(nameRefs.current)) {
            if (!validIds.has(id)) delete nameRefs.current[id];
        }

        for (const id of Object.keys(colorBtnRefs.current)) {
            if (!validIds.has(id)) delete colorBtnRefs.current[id];
        }
    }, [tabs, tabGroups]);

    useEffect(() => {
        if (!editingColor) return;

        function handleClose() { setEditingColor(null); }

        document.addEventListener('mousedown', handleClose);
        window.addEventListener('scroll', handleClose, true);
        window.addEventListener('resize', handleClose);

        return () => {
            document.removeEventListener('mousedown', handleClose);
            window.removeEventListener('scroll', handleClose, true);
            window.removeEventListener('resize', handleClose);
        };
    }, [editingColor]);

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

        const rect = btn.getBoundingClientRect();
        setPickerPos({ top: rect.bottom + 8, left: rect.left });
        setEditingColor(target);
    }

    function handleColorChange(color) {
        if (!editingColor) return;

        if (editingColor.kind === 'group') onUpdateGroup(editingColor.id, { color });
        else onUpdate(editingColor.id, { color });

        setEditingColor(null);
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
                className={`kanban-tab ${activeTabId === tab.id ? 'active' : ''}`}
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
    const pickerColor = editingColor?.color;
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
            </div>

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

            {editingColor && createPortal(
                <div
                    className="kanban-tab-color-picker"
                    style={{ top: pickerPos.top, left: pickerPos.left }}
                    onMouseDown={e => e.stopPropagation()}
                >
                    {PRESET_COLORS.map(({ color, label }) => (
                        <button
                            key={color}
                            className={`kanban-tab-color-swatch ${pickerColor === color ? 'selected' : ''}`}
                            style={{ background: color }}
                            title={label}
                            onClick={() => handleColorChange(color)}
                        />
                    ))}
                </div>,
                document.body
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
