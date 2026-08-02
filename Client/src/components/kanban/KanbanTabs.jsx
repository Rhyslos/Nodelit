// hook imports
import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';

// component imports
import TabContextMenu from './TabContextMenu';
import ConfirmModal from './ConfirmModal';

// ui components
export default function KanbanTabs({ tabs, activeTabId, onSelect, onAdd, onUpdate, onArchive, onDelete }) {
    // state variables
    const [editingId, setEditingId] = useState(null);
    const [editingColor, setEditingColor] = useState(null);
    const [pickerPos, setPickerPos] = useState({ top: 0, left: 0 });
    const [menuTab, setMenuTab] = useState(null);
    const [menuPos, setMenuPos] = useState({ x: 0, y: 0 });
    const [confirmTab, setConfirmTab] = useState(null);

    // dom references
    const nameRefs = useRef({});
    const colorBtnRefs = useRef({});

    // lifecycle functions
    useEffect(() => {
        const validIds = new Set(tabs.map(t => t.id));
        Object.keys(nameRefs.current).forEach(id => {
            if (!validIds.has(id)) delete nameRefs.current[id];
        });
        Object.keys(colorBtnRefs.current).forEach(id => {
            if (!validIds.has(id)) delete colorBtnRefs.current[id];
        });
    }, [tabs]);

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

    // event functions
    function startEditing(tab) {
        setEditingId(tab.id);
        const el = nameRefs.current[tab.id];
        if (!el) return;
        requestAnimationFrame(() => {
            el.focus();
            const range = document.createRange();
            range.selectNodeContents(el);
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
        });
    }

    function handleNameBlur(tab) {
        const text = nameRefs.current[tab.id]?.textContent.trim();
        if (text && text !== tab.name) {
            onUpdate(tab.id, { name: text, color: tab.color });
        } else if (nameRefs.current[tab.id]) {
            nameRefs.current[tab.id].textContent = tab.name;
        }
        setEditingId(null);
        setEditingColor(null);
    }

    function handleNameKeyDown(e, tab) {
        if (e.key === 'Enter') {
            e.preventDefault();
            nameRefs.current[tab.id]?.blur();
        }
        if (e.key === 'Escape') {
            if (nameRefs.current[tab.id]) nameRefs.current[tab.id].textContent = tab.name;
            nameRefs.current[tab.id]?.blur();
        }
    }

    function handleColorBtnClick(e, tab) {
        e.stopPropagation();
        if (editingColor === tab.id) {
            setEditingColor(null);
            return;
        }
        const btn = colorBtnRefs.current[tab.id];
        if (!btn) return;

        const rect = btn.getBoundingClientRect();
        setPickerPos({
            top: rect.bottom + 8,
            left: rect.left,
        });
        setEditingColor(tab.id);
    }

    function handleColorChange(tab, color) {
        onUpdate(tab.id, { name: tab.name, color });
        setEditingColor(null);
    }

    function handleContextMenu(e, tab) {
        e.preventDefault();
        if (tabs.length <= 1) return;
        setMenuTab(tab);
        setMenuPos({ x: e.clientX, y: e.clientY });
    }

    function handleMenuDelete() {
        setConfirmTab(menuTab);
        setMenuTab(null);
    }

    function handleConfirmDelete() {
        if (confirmTab) onDelete?.(confirmTab.id);
        setConfirmTab(null);
    }

    // state variables
    const PRESET_COLORS = [
        { color: '#ffb3b3', label: 'Red'     },
        { color: '#ffd0a8', label: 'Orange'  },
        { color: '#fff0a8', label: 'Yellow'  },
        { color: '#b8f0c8', label: 'Green'   },
        { color: '#b3d8ff', label: 'Blue'    },
        { color: '#ffb3d9', label: 'Pink'    },
        { color: '#e8b3ff', label: 'Magenta' },
    ];

    const activeTab = tabs.find(t => t.id === editingColor);

    return (
        <div className="kanban-tabs">
            <div className="kanban-tabs-strip">
                {tabs.map(tab => (
                    <div
                        key={tab.id}
                        className={`kanban-tab ${activeTabId === tab.id ? 'active' : ''}`}
                        onClick={() => { if (editingId !== tab.id) onSelect(tab.id); }}
                        onDoubleClick={() => startEditing(tab)}
                        onContextMenu={e => handleContextMenu(e, tab)}
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
                                    onClick={e => handleColorBtnClick(e, tab)}
                                >
                                    ●
                                </button>
                            </div>
                        )}
                    </div>
                ))}

                <button className="kanban-tab-add-btn" onClick={onAdd} title="New tab">
                    +
                </button>
            </div>

            {editingColor && activeTab && createPortal(
                <div
                    className="kanban-tab-color-picker"
                    style={{ top: pickerPos.top, left: pickerPos.left }}
                    onMouseDown={e => e.stopPropagation()}
                >
                    {PRESET_COLORS.map(({ color, label }) => (
                        <button
                            key={color}
                            className={`kanban-tab-color-swatch ${activeTab?.color === color ? 'selected' : ''}`}
                            style={{ background: color }}
                            title={label}
                            onClick={() => handleColorChange(activeTab, color)}
                        />
                    ))}
                </div>,
                document.body
            )}

            <TabContextMenu
                open={!!menuTab}
                x={menuPos.x}
                y={menuPos.y}
                onDelete={handleMenuDelete}
                onClose={() => setMenuTab(null)}
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