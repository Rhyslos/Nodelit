import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useNotationSidebar } from '../../hooks/useNotationSidebar';

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
    isEditing,
    isDragged,
    dropPosition,
    onSelect,
    onStartEditing,
    onCommitTitle,
    onDragStart,
    onDragOver,
    onDragLeave,
    onDrop
}) {
    const titleRef = useRef(null);

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
                draggable={canEdit && !isEditing}
                onDragStart={event => onDragStart(event, page.id)}
                onDragOver={event => onDragOver(event, page.id)}
                onDragLeave={onDragLeave}
                onDrop={event => onDrop(event, page, list)}
                onClick={() => { if (!isEditing) onSelect(page.id); }}
                onDoubleClick={() => {
                    if (!canEdit) return;
                    onStartEditing(page.id);
                    selectContents(titleRef.current);
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

function GroupHeader({ group, isCollapsed, canEdit, isEditing, onToggle, onStartEditing, onCommitName, onColorClick, onAddPage }) {
    const nameRef = useRef(null);
    const colorRef = useRef(null);

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
            className="notation-sidebar-group-header"
            onClick={() => { if (!isEditing) onToggle(group.id); }}
            onDoubleClick={() => {
                if (!canEdit) return;
                onStartEditing(group.id);
                selectContents(nameRef.current);
            }}
        >
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
        createPage,
        renamePage,
        reorderPages
    } = useNotationSidebar();

    const [collapsedGroups, setCollapsedGroups] = useState(new Set());
    const [editingGroupID, setEditingGroupID] = useState(null);
    const [editingPageID, setEditingPageID] = useState(null);

    const [showModal, setShowModal] = useState(false);
    const [modalPos, setModalPos] = useState({ top: 0, left: 0 });
    const [step, setStep] = useState('main');
    const [selectedGroupID, setSelectedGroupID] = useState(null);

    const [colorPickerID, setColorPickerID] = useState(null);
    const [pickerPos, setPickerPos] = useState({ top: 0, left: 0 });

    const [draggedPageID, setDraggedPageID] = useState(null);
    const [dropTargetID, setDropTargetID] = useState(null);
    const [dropPosition, setDropPosition] = useState(null);

    // data derived
    const groupIDs = new Set(groups.map(group => group.id));
    const uncategorized = pages.filter(page => !page.groupID || !groupIDs.has(page.groupID));

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

        const rect = element.getBoundingClientRect();
        setPickerPos({ top: rect.bottom + 8, left: rect.left });
        setColorPickerID(groupID);
    }

    async function handleAddPage(groupID) {
        const page = await createPage('Untitled', groupID);
        if (page) onPageSelect(page.id);
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

    // modal handlers
    const closeModal = useCallback(() => {
        setShowModal(false);
        setStep('main');
        setSelectedGroupID(null);
    }, []);

    const closeColorPicker = useCallback(() => setColorPickerID(null), []);

    async function handleNewPage() {
        const page = await createPage('Untitled', selectedGroupID);
        if (page) onPageSelect(page.id);
        closeModal();
    }

    async function handleNewGroup() {
        await createGroup('New group');
        closeModal();
    }

    // side effects
    useDismiss(showModal, closeModal);
    useDismiss(Boolean(colorPickerID), closeColorPicker);

    useEffect(() => {
        if (loading || activePageID || pages.length === 0) return;
        onPageSelect(pages[0].id);
    }, [loading, pages, activePageID, onPageSelect]);

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
                onDragOver={handleDragOverGroup}
                onDrop={event => handleDropOnGroup(event, null, uncategorized)}
            >
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
                    />
                ))}

                {groups.map(group => {
                    const groupPages = pages.filter(page => page.groupID === group.id);
                    const isCollapsed = collapsedGroups.has(group.id);

                    return (
                        <div
                            key={group.id}
                            className="notation-sidebar-group"
                            onDragOver={handleDragOverGroup}
                            onDrop={event => handleDropOnGroup(event, group.id, groupPages)}
                        >
                            <GroupHeader
                                group={group}
                                isCollapsed={isCollapsed}
                                canEdit={canEdit}
                                isEditing={editingGroupID === group.id}
                                onToggle={toggleGroup}
                                onStartEditing={setEditingGroupID}
                                onCommitName={renameGroup}
                                onColorClick={handleColorClick}
                                onAddPage={handleAddPage}
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
                                        />
                                    ))}
                                </div>
                            )}
                        </div>
                    );
                })}

                {canEdit && (
                    <button
                        className="notation-sidebar-add"
                        onClick={event => {
                            const rect = event.currentTarget.getBoundingClientRect();
                            setModalPos({ top: rect.bottom + 8, left: rect.left });
                            setShowModal(true);
                        }}
                    >
                        +
                    </button>
                )}
            </div>

            {showModal && createPortal(
                <div
                    className="notation-modal"
                    style={{ position: 'absolute', top: modalPos.top, left: modalPos.left, zIndex: 1000, margin: 0, transform: 'none' }}
                    onMouseDown={event => event.stopPropagation()}
                >
                    <div className="notation-modal-header">
                        <h3>{step === 'main' ? 'Create New' : 'Select Group'}</h3>
                        <button className="notation-modal-close" onClick={closeModal}>✕</button>
                    </div>

                    <div className="notation-modal-body">
                        {step === 'main' && (
                            <div className="notation-modal-actions-grid">
                                <button className="notation-modal-action-card" onClick={() => setStep('page')}>
                                    <div className="notation-modal-text">
                                        <p className="notation-modal-label">New page</p>
                                        <p className="notation-modal-sub">Add a notation page</p>
                                    </div>
                                </button>
                                <button className="notation-modal-action-card" onClick={handleNewGroup}>
                                    <div className="notation-modal-text">
                                        <p className="notation-modal-label">New group</p>
                                        <p className="notation-modal-sub">Organize pages</p>
                                    </div>
                                </button>
                            </div>
                        )}

                        {step === 'page' && (
                            <div className="notation-modal-list">
                                <button
                                    className={`notation-list-item ${selectedGroupID === null ? 'selected' : ''}`}
                                    onClick={() => setSelectedGroupID(null)}
                                >
                                    <span className="notation-modal-icon">📄</span>
                                    <p className="notation-modal-label">Uncategorized</p>
                                </button>

                                {groups.map(group => (
                                    <button
                                        key={group.id}
                                        className={`notation-list-item ${selectedGroupID === group.id ? 'selected' : ''}`}
                                        onClick={() => setSelectedGroupID(group.id)}
                                    >
                                        <span className="notation-modal-icon">📁</span>
                                        <p className="notation-modal-label">{group.name}</p>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {step === 'page' && (
                        <div className="notation-modal-footer">
                            <button className="notation-btn-secondary" onClick={() => setStep('main')}>Back</button>
                            <button className="notation-btn-primary" onClick={handleNewPage}>Create page</button>
                        </div>
                    )}
                </div>,
                document.body
            )}

            {colorPickerID && createPortal(
                <div
                    className="kanban-tab-color-picker"
                    style={{ top: pickerPos.top, left: pickerPos.left }}
                    onMouseDown={event => event.stopPropagation()}
                >
                    {PRESET_COLORS.map(({ color, label }) => (
                        <button
                            key={color}
                            className="kanban-tab-color-swatch"
                            style={{ background: color }}
                            title={label}
                            onClick={() => {
                                colorGroup(colorPickerID, color);
                                setColorPickerID(null);
                            }}
                        />
                    ))}
                </div>,
                document.body
            )}
        </>
    );
}
