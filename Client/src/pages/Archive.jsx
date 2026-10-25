// page imports
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { Archive as ArchiveIcon, SquareCheckBig, ListTodo, SquareKanban, FileText, CalendarDays, RotateCcw, Trash2, Search, X } from 'lucide-react';
import { api } from '../lib/api';
import { useKanban } from '../contexts/KanbanContext';
import { useStream } from '../contexts/StreamContext';
import { useToast } from '../contexts/ToastContext';
import ConfirmModal from '../components/kanban/ConfirmModal';

// configuration constants
const KINDS = {
    task: { label: 'Task', plural: 'Tasks', Icon: SquareCheckBig },
    list: { label: 'List', plural: 'Lists', Icon: ListTodo },
    board: { label: 'Board', plural: 'Boards', Icon: SquareKanban },
    page: { label: 'Page', plural: 'Pages', Icon: FileText },
    meeting: { label: 'Meeting', plural: 'Meetings', Icon: CalendarDays }
};

const FILTERS = ['all', 'task', 'list', 'board', 'page', 'meeting'];

// utility functions
function plural(count, word) {
    return `${count} ${word}${count === 1 ? '' : 's'}`;
}

function relativeTime(value) {
    const seconds = Math.round((Date.now() - new Date(value).getTime()) / 1000);

    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)} h ago`;
    if (seconds < 86400 * 7) return `${Math.floor(seconds / 86400)} d ago`;

    return new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function meetingTime(startsAt, endsAt) {
    const start = new Date(startsAt);
    const end = new Date(endsAt);

    return `${start.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })} · `
        + `${start.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })} – `
        + `${end.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`;
}

function describe(item) {
    const context = item.context ?? {};

    if (item.kind === 'task') return `From ${context.list} on ${context.board}`;
    if (item.kind === 'list') return `From ${context.board} · ${plural(context.tasks ?? 0, 'task')}`;
    if (item.kind === 'board') return `${plural(context.lists ?? 0, 'list')}, ${plural(context.tasks ?? 0, 'task')}`;
    if (item.kind === 'page') return context.group ? `Notes page in ${context.group}` : 'Notes page';
    if (item.kind === 'meeting') return meetingTime(context.startsAt, context.endsAt);

    return '';
}

// component functions
function ItemDetails({ details }) {
    if (details.kind === 'task') {
        const checklists = details.checklists ?? [];

        return (
            <div className="archive-details">
                <p className="archive-details-meta">
                    {details.boardName} / {details.listName}
                    {details.isCompleted && ' · completed'}
                    {details.deadline && ` · due ${details.deadline}`}
                </p>

                {details.description
                    ? <p className="archive-details-text">{details.description}</p>
                    : <p className="archive-details-empty">No description</p>}

                {details.assigneeNames?.length > 0 && (
                    <p className="archive-details-meta">Assigned to {details.assigneeNames.join(', ')}</p>
                )}

                {details.tagNames?.length > 0 && (
                    <p className="archive-details-meta">Tags: {details.tagNames.join(', ')}</p>
                )}

                {checklists.map(list => (
                    <div className="archive-details-group" key={list.id}>
                        <span className="archive-details-heading">{list.name}</span>
                        <ul className="archive-details-list">
                            {list.items.map(entry => (
                                <li key={entry.id} className={entry.done ? 'is-done' : ''}>{entry.text}</li>
                            ))}
                        </ul>
                    </div>
                ))}
            </div>
        );
    }

    if (details.kind === 'list') {
        return (
            <div className="archive-details">
                <p className="archive-details-meta">From {details.boardName}</p>
                {details.tasks.length === 0
                    ? <p className="archive-details-empty">No tasks</p>
                    : (
                        <ul className="archive-details-list">
                            {details.tasks.map(task => (
                                <li key={task.id} className={task.isCompleted ? 'is-done' : ''}>{task.title || 'Untitled task'}</li>
                            ))}
                        </ul>
                    )}
            </div>
        );
    }

    if (details.kind === 'board') {
        return (
            <div className="archive-details">
                {details.lists.length === 0 && <p className="archive-details-empty">No lists</p>}

                {details.lists.map(list => (
                    <div className="archive-details-group" key={list.id}>
                        <span className="archive-details-heading">{list.name}</span>
                        <ul className="archive-details-list">
                            {list.tasks.map(task => (
                                <li key={task.id} className={task.isCompleted ? 'is-done' : ''}>{task.title || 'Untitled task'}</li>
                            ))}
                            {list.tasks.length === 0 && <li className="archive-details-empty">No tasks</li>}
                        </ul>
                    </div>
                ))}
            </div>
        );
    }

    if (details.kind === 'page') {
        return (
            <div className="archive-details">
                {details.content
                    ? <p className="archive-details-text archive-details-page">{details.content}</p>
                    : <p className="archive-details-empty">This page is empty</p>}
            </div>
        );
    }

    if (details.kind === 'meeting') {
        return (
            <div className="archive-details">
                <p className="archive-details-meta">{meetingTime(details.startsAt, details.endsAt)}</p>
                {details.description && <p className="archive-details-text">{details.description}</p>}
            </div>
        );
    }

    return null;
}

export default function Archive() {
    const { workspaceID } = useParams();
    const { canEdit } = useKanban();
    const { subscribe } = useStream();
    const { notify, notifyError } = useToast();

    // state variables
    const [items, setItems] = useState(null);
    const [filter, setFilter] = useState('all');
    const [search, setSearch] = useState('');
    const [busyID, setBusyID] = useState(null);
    const [opened, setOpened] = useState(null);
    const [details, setDetails] = useState(null);
    const [confirmDelete, setConfirmDelete] = useState(null);

    // data fetching
    const load = useCallback(async () => {
        try {
            const data = await api(`/api/archive/${workspaceID}`);
            setItems(data.items);
        } catch (error) {
            notifyError(error, 'Could not load the Archive');
            setItems(current => current ?? []);
        }
    }, [workspaceID, notifyError]);

    useEffect(() => {
        let active = true;

        api(`/api/archive/${workspaceID}`)
            .then(data => { if (active) setItems(data.items); })
            .catch(error => {
                if (!active) return;
                notifyError(error, 'Could not load the Archive');
                setItems([]);
            });

        return () => { active = false; };
    }, [workspaceID, notifyError]);

    // anything archived or restored elsewhere shows up here too
    useEffect(() => {
        const stops = ['kanban', 'notation', 'calendar', 'reconnected'].map(type => subscribe(type, () => load()));
        return () => stops.forEach(stop => stop());
    }, [subscribe, load]);

    useEffect(() => {
        if (!opened) return;

        let active = true;

        api(`/api/archive/${opened.kind}/${opened.id}`)
            .then(data => { if (active) setDetails(data); })
            .catch(error => {
                if (!active) return;
                notifyError(error, 'Could not open this item');
                setOpened(null);
            });

        return () => { active = false; };
    }, [opened, notifyError]);

    // event handlers
    function closeDetails() {
        setOpened(null);
        setDetails(null);
    }

    async function handleRestore(item) {
        setBusyID(item.id);

        try {
            await api(`/api/archive/${item.kind}/${item.id}/restore`, { method: 'POST' });
            setItems(current => current.filter(entry => entry.id !== item.id));
            if (opened?.id === item.id) closeDetails();
            notify('Restored', `"${item.title || KINDS[item.kind].label}" is back where it was.`);
        } catch (error) {
            notifyError(error, 'Could not restore this item');
        } finally {
            setBusyID(null);
        }
    }

    async function handleDelete(item) {
        setConfirmDelete(null);
        setBusyID(item.id);

        try {
            await api(`/api/archive/${item.kind}/${item.id}`, { method: 'DELETE' });
            setItems(current => current.filter(entry => entry.id !== item.id));
            if (opened?.id === item.id) closeDetails();
            notify('Deleted for good', `"${item.title || KINDS[item.kind].label}" was removed.`);
        } catch (error) {
            notifyError(error, 'Could not delete this item');
        } finally {
            setBusyID(null);
        }
    }

    // derived variables
    const counts = useMemo(() => {
        const result = { all: items?.length ?? 0 };
        for (const item of items ?? []) result[item.kind] = (result[item.kind] ?? 0) + 1;
        return result;
    }, [items]);

    const query = search.trim().toLowerCase();
    const visible = (items ?? []).filter(item =>
        (filter === 'all' || item.kind === filter)
        && (!query || `${item.title} ${describe(item)}`.toLowerCase().includes(query)));

    function deleteMessage(item) {
        if (!item) return '';

        const name = `"${item.title || KINDS[item.kind].label}"`;
        if (item.kind === 'list') return `${name} and its ${plural(item.context?.tasks ?? 0, 'task')} will be deleted for good. This cannot be undone.`;
        if (item.kind === 'board') return `${name} with its ${plural(item.context?.lists ?? 0, 'list')} and ${plural(item.context?.tasks ?? 0, 'task')} will be deleted for good. This cannot be undone.`;

        return `${name} will be deleted for good. This cannot be undone.`;
    }

    return (
        <div className="archive-root">
            <div className="archive-head">
                <div>
                    <h1 className="archive-title">Archive</h1>
                    <p className="archive-intro">
                        Deleted tasks, lists, boards, pages and meetings land here. Restore them, or delete them for good.
                    </p>
                </div>

                <label className="archive-search">
                    <Search size={15} strokeWidth={2} />
                    <input
                        type="search"
                        placeholder="Search the Archive"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                    />
                </label>
            </div>

            <div className="archive-filters" role="tablist" aria-label="Filter by type">
                {FILTERS.map(key => (
                    <button
                        key={key}
                        type="button"
                        role="tab"
                        aria-selected={filter === key}
                        className={`archive-filter ${filter === key ? 'active' : ''}`}
                        onClick={() => setFilter(key)}
                    >
                        {key === 'all' ? 'All' : KINDS[key].plural}
                        <span className="archive-filter-count">{counts[key] ?? 0}</span>
                    </button>
                ))}
            </div>

            {items === null && <p className="archive-empty">Loading…</p>}

            {items !== null && visible.length === 0 && (
                <div className="archive-empty">
                    <ArchiveIcon size={28} strokeWidth={1.6} />
                    <p>{items.length === 0 ? 'Nothing in the Archive.' : 'Nothing matches.'}</p>
                </div>
            )}

            <ul className="archive-list">
                {visible.map(item => {
                    const { Icon, label } = KINDS[item.kind];

                    return (
                        <li className="archive-item" key={`${item.kind}-${item.id}`}>
                            <button type="button" className="archive-item-main" onClick={() => setOpened(item)}>
                                <span className="archive-item-icon" style={{ '--board-color': item.context?.boardColor }}>
                                    <Icon size={18} strokeWidth={2} />
                                </span>

                                <span className="archive-item-text">
                                    <span className="archive-item-title">
                                        {item.title || `Untitled ${label.toLowerCase()}`}
                                    </span>
                                    <span className="archive-item-meta">
                                        <span className="archive-item-kind">{label}</span>
                                        {describe(item)}
                                    </span>
                                    <span className="archive-item-when">
                                        Archived {relativeTime(item.archivedAt)}{item.archivedBy ? ` by ${item.archivedBy}` : ''}
                                    </span>
                                </span>
                            </button>

                            {canEdit && (
                                <span className="archive-item-actions">
                                    <button
                                        type="button"
                                        className="archive-btn"
                                        disabled={busyID === item.id}
                                        onClick={() => handleRestore(item)}
                                    >
                                        <RotateCcw size={15} strokeWidth={2} />
                                        Restore
                                    </button>

                                    <button
                                        type="button"
                                        className="archive-btn archive-btn--danger"
                                        disabled={busyID === item.id}
                                        onClick={() => setConfirmDelete(item)}
                                        aria-label={`Delete ${item.title || label} for good`}
                                        title="Delete for good"
                                    >
                                        <Trash2 size={15} strokeWidth={2} />
                                    </button>
                                </span>
                            )}
                        </li>
                    );
                })}
            </ul>

            {opened && (
                <div className="kanban-modal-overlay" onClick={closeDetails}>
                    <div className="kanban-modal archive-modal" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
                        <div className="archive-modal-head">
                            <span className="archive-item-icon">
                                {(() => { const { Icon } = KINDS[opened.kind]; return <Icon size={18} strokeWidth={2} />; })()}
                            </span>
                            <div className="archive-modal-heading">
                                <h2 className="archive-modal-title">{opened.title || `Untitled ${KINDS[opened.kind].label.toLowerCase()}`}</h2>
                                <span className="archive-item-when">
                                    {KINDS[opened.kind].label} · archived {relativeTime(opened.archivedAt)}
                                    {opened.archivedBy ? ` by ${opened.archivedBy}` : ''}
                                </span>
                            </div>
                            <button type="button" className="archive-modal-close" onClick={closeDetails} aria-label="Close">
                                <X size={18} strokeWidth={2} />
                            </button>
                        </div>

                        {details ? <ItemDetails details={details} /> : <p className="archive-empty">Loading…</p>}

                        {canEdit && (
                            <div className="kanban-modal-actions archive-modal-actions">
                                <button
                                    type="button"
                                    className="archive-btn archive-btn--danger"
                                    disabled={busyID === opened.id}
                                    onClick={() => setConfirmDelete(opened)}
                                >
                                    <Trash2 size={15} strokeWidth={2} />
                                    Delete for good
                                </button>

                                <button
                                    type="button"
                                    className="kanban-modal-submit"
                                    disabled={busyID === opened.id}
                                    onClick={() => handleRestore(opened)}
                                >
                                    Restore
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}

            <ConfirmModal
                open={!!confirmDelete}
                title="Delete for good?"
                message={deleteMessage(confirmDelete)}
                confirmLabel="Delete for good"
                cancelLabel="Cancel"
                onConfirm={() => handleDelete(confirmDelete)}
                onCancel={() => setConfirmDelete(null)}
            />
        </div>
    );
}
