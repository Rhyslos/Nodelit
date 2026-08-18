// component imports
import { useState, useMemo, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, CalendarPlus, Trash2, Rows3 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useKanban } from '../contexts/KanbanContext';
import { useWorkspacePresence } from '../hooks/useWorkspacePresence';
import { useCalendar } from '../hooks/useCalendar';
import ConfirmModal from '../components/kanban/ConfirmModal';

// configuration constants
const SLOT_MINUTES = 30;
const SLOT_MS = SLOT_MINUTES * 60 * 1000;
const DAY_START_HOUR = 9;
const DAY_END_HOUR = 21;
const MAX_AVATARS = 5;
const DURATIONS = [30, 60, 90, 120, 180];
const ROW_STORAGE_KEY = 'nodelit:calendarrowheight';
const ROW_MIN = 20;
const ROW_MAX = 72;
const ROW_DEFAULT = 32;
const COMPACT_HEIGHT = 46;
const COMPACT_AVATARS = 3;
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// utility functions
function startOfDay(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function startOfWeek(date) {
    const day = startOfDay(date);
    const offset = (day.getDay() + 6) % 7;

    return new Date(day.getFullYear(), day.getMonth(), day.getDate() - offset);
}

function addDays(date, count) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate() + count);
}

function startOfMonthGrid(date) {
    return startOfWeek(new Date(date.getFullYear(), date.getMonth(), 1));
}

function sameDay(a, b) {
    return a.getFullYear() === b.getFullYear()
        && a.getMonth() === b.getMonth()
        && a.getDate() === b.getDate();
}

function slotKey(date) {
    return new Date(date).toISOString();
}

function formatTime(date) {
    return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function formatRange(start, end) {
    return `${formatTime(start)} – ${formatTime(end)}`;
}

function avatarLetter(member) {
    if (member?.displayName) return member.displayName.charAt(0).toUpperCase();
    if (member?.username) return member.username.charAt(0).toUpperCase();

    return '?';
}

function avatarColor(member) {
    return member?.cursorColor || 'var(--muted)';
}

function blockBackground(userIDs, memberByID) {
    const colors = userIDs.map(id => avatarColor(memberByID.get(id)));
    if (colors.length === 0) return undefined;

    const soften = color => `color-mix(in srgb, ${color} 55%, var(--panel))`;

    if (colors.length === 1) return soften(colors[0]);

    const step = 100 / colors.length;
    const stops = colors.map((color, index) => `${soften(color)} ${index * step}% ${(index + 1) * step}%`);

    return `linear-gradient(90deg, ${stops.join(', ')})`;
}

function readRowHeight() {
    try {
        const stored = Number(localStorage.getItem(ROW_STORAGE_KEY));
        if (stored >= ROW_MIN && stored <= ROW_MAX) return stored;
    } catch {
        return ROW_DEFAULT;
    }

    return ROW_DEFAULT;
}

function toDateValue(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function toTimeValue(date) {
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function formatDuration(minutes) {
    if (minutes < 60) return `${minutes} min`;
    if (minutes % 60 === 0) return `${minutes / 60} hr`;

    return `${Math.floor(minutes / 60)} hr ${minutes % 60} min`;
}

// component functions
export default function Calendar() {
    const { workspaceID } = useParams();
    const { user } = useAuth();
    const { canEdit } = useKanban();
    const { members } = useWorkspacePresence(workspaceID);

    // state variables
    const [view, setView] = useState('week');
    const [anchor, setAnchor] = useState(() => startOfDay(new Date()));
    const [draft, setDraft] = useState(null);
    const [rowHeight, setRowHeight] = useState(readRowHeight);
    const [resizing, setResizing] = useState(false);
    const [confirmMeeting, setConfirmMeeting] = useState(null);

    // drag references
    const paintRef = useRef(null);
    const resizeRef = useRef(null);
    const rowHeightRef = useRef(rowHeight);
    rowHeightRef.current = rowHeight;
    const [pending, setPending] = useState({ added: new Set(), removed: new Set() });
    const pendingRef = useRef(pending);
    pendingRef.current = pending;

    // range variables
    const range = useMemo(() => {
        if (view === 'week') {
            const from = startOfWeek(anchor);
            return { from, to: addDays(from, 7) };
        }

        const from = startOfMonthGrid(anchor);
        return { from, to: addDays(from, 42) };
    }, [view, anchor]);

    const {
        slots,
        meetings,
        loading,
        slotMinutes,
        setAvailability,
        createMeeting,
        deleteMeeting
    } = useCalendar(workspaceID, range.from, range.to, user?.id);

    // derived variables
    const memberCount = Math.max(members.length, 1);

    const memberByID = useMemo(
        () => new Map(members.map(member => [member.id, member])),
        [members]
    );

    const days = useMemo(() => {
        const count = view === 'week' ? 7 : 42;
        return Array.from({ length: count }, (_, index) => addDays(range.from, index));
    }, [range.from, view]);

    const times = useMemo(() => {
        const result = [];
        const total = (DAY_END_HOUR - DAY_START_HOUR) * (60 / SLOT_MINUTES);

        for (let index = 0; index < total; index++) {
            const minutes = DAY_START_HOUR * 60 + index * SLOT_MINUTES;
            result.push({ hour: Math.floor(minutes / 60), minute: minutes % 60 });
        }

        return result;
    }, []);

    const hours = useMemo(
        () => Array.from({ length: DAY_END_HOUR - DAY_START_HOUR }, (_, index) => DAY_START_HOUR + index),
        []
    );

    const dayStats = useMemo(() => {
        const stats = {};

        for (const [iso, userIDs] of Object.entries(slots)) {
            const date = new Date(iso);
            const key = startOfDay(date).getTime();

            if (!stats[key]) stats[key] = { best: 0, slots: 0 };

            stats[key].slots += 1;
            stats[key].best = Math.max(stats[key].best, userIDs.length);
        }

        return stats;
    }, [slots]);

    const meetingsByDay = useMemo(() => {
        const map = {};

        for (const meeting of meetings) {
            const key = startOfDay(new Date(meeting.startsAt)).getTime();
            if (!map[key]) map[key] = [];
            map[key].push(meeting);
        }

        return map;
    }, [meetings]);

    // lifecycle functions
    useEffect(() => {
        function handleResizeMove(e) {
            if (!resizeRef.current) return;

            const { startY, startHeight } = resizeRef.current;
            const next = startHeight + (e.clientY - startY) / times.length;

            setRowHeight(Math.min(Math.max(Math.round(next), ROW_MIN), ROW_MAX));
        }

        function handleResizeUp() {
            if (!resizeRef.current) return;

            resizeRef.current = null;
            setResizing(false);
            persistRowHeight(rowHeightRef.current);
        }

        window.addEventListener('mousemove', handleResizeMove);
        window.addEventListener('mouseup', handleResizeUp);

        return () => {
            window.removeEventListener('mousemove', handleResizeMove);
            window.removeEventListener('mouseup', handleResizeUp);
        };
    }, [times.length]);

    useEffect(() => {
        function handleUp() {
            if (!paintRef.current) return;

            paintRef.current = null;

            const added = [...pendingRef.current.added];
            const removed = [...pendingRef.current.removed];

            setPending({ added: new Set(), removed: new Set() });

            if (added.length > 0 || removed.length > 0) setAvailability(added, removed);
        }

        function handleCancel() {
            paintRef.current = null;
        }

        window.addEventListener('mouseup', handleUp);
        window.addEventListener('dragstart', handleCancel);

        return () => {
            window.removeEventListener('mouseup', handleUp);
            window.removeEventListener('dragstart', handleCancel);
        };
    }, [setAvailability]);

    // slot helpers
    function slotDate(day, time) {
        return new Date(day.getFullYear(), day.getMonth(), day.getDate(), time.hour, time.minute);
    }

    function slotUsers(date) {
        const iso = slotKey(date);
        const base = slots[iso] ?? [];

        if (pending.added.has(iso)) return base.includes(user?.id) ? base : [...base, user?.id];
        if (pending.removed.has(iso)) return base.filter(id => id !== user?.id);

        return base;
    }

    // event handlers
    function markSlot(iso, present) {
        setPending(current => {
            const added = new Set(current.added);
            const removed = new Set(current.removed);

            if (present) {
                removed.delete(iso);
                added.add(iso);
            } else {
                added.delete(iso);
                removed.add(iso);
            }

            return { added, removed };
        });
    }

    function handleSlotDown(e, date) {
        if (!canEdit || e.button !== 0) return;

        e.preventDefault();

        const mine = slotUsers(date).includes(user?.id);

        paintRef.current = mine ? 'remove' : 'add';
        markSlot(slotKey(date), !mine);
    }

    function handleSlotEnter(date) {
        if (!canEdit || !paintRef.current) return;

        const mine = slotUsers(date).includes(user?.id);

        if (paintRef.current === 'add' && !mine) markSlot(slotKey(date), true);
        if (paintRef.current === 'remove' && mine) markSlot(slotKey(date), false);
    }

    function draftRange(entry) {
        if (!entry) return null;

        const [year, month, day] = entry.date.split('-').map(Number);
        const [hour, minute] = entry.time.split(':').map(Number);

        const start = new Date(year, month - 1, day, hour, minute);

        return { start, end: new Date(start.getTime() + entry.minutes * 60000) };
    }

    function draftOverlap(entry) {
        const range = draftRange(entry);
        if (!range) return [];

        let common = null;

        for (let time = range.start.getTime(); time < range.end.getTime(); time += SLOT_MS) {
            const users = new Set(slots[new Date(time).toISOString()] ?? []);

            common = common === null
                ? users
                : new Set([...common].filter(id => users.has(id)));
        }

        return [...(common ?? [])];
    }

    function openDraft(start, minutes) {
        const base = start ?? new Date(
            anchor.getFullYear(), anchor.getMonth(), anchor.getDate(), DAY_START_HOUR, 0
        );

        setDraft({
            date: toDateValue(base),
            time: toTimeValue(base),
            minutes: minutes ?? SLOT_MINUTES,
            title: ''
        });
    }

    function handleBookMeeting() {
        const range = draftRange(draft);
        if (!range) return;

        createMeeting({
            title: draft.title.trim() || 'Meeting',
            startsAt: range.start.toISOString(),
            endsAt: range.end.toISOString()
        });

        setDraft(null);
    }

    function persistRowHeight(value) {
        try {
            localStorage.setItem(ROW_STORAGE_KEY, String(value));
        } catch {
            return;
        }
    }

    function handleRowHeight(value) {
        setRowHeight(value);
        persistRowHeight(value);
    }

    function handleResizeDown(e) {
        if (e.button !== 0) return;

        e.preventDefault();
        resizeRef.current = { startY: e.clientY, startHeight: rowHeightRef.current };
        setResizing(true);
    }

    function shiftAnchor(direction) {
        if (view === 'week') {
            setAnchor(previous => addDays(previous, direction * 7));
            return;
        }

        setAnchor(previous => new Date(previous.getFullYear(), previous.getMonth() + direction, 1));
    }

    // render functions
    function daySegments(day) {
        const result = [];
        let current = null;

        times.forEach((time, index) => {
            const users = slotUsers(slotDate(day, time));

            if (users.length === 0) {
                current = null;
                return;
            }

            const sorted = [...users].sort();
            const key = sorted.join(',');

            if (current && current.key === key) {
                current.span += 1;
                return;
            }

            current = { key, userIDs: sorted, startIndex: index, span: 1 };
            result.push(current);
        });

        return result;
    }

    function dayMeetingBlocks(day) {
        const dayStart = slotDate(day, times[0]).getTime();
        const blocks = [];

        for (const meeting of meetings) {
            const startIndex = Math.round((new Date(meeting.startsAt).getTime() - dayStart) / SLOT_MS);
            const endIndex = Math.round((new Date(meeting.endsAt).getTime() - dayStart) / SLOT_MS);

            if (endIndex <= 0 || startIndex >= times.length) continue;

            const clampedStart = Math.max(0, startIndex);

            blocks.push({
                meeting,
                startIndex: clampedStart,
                span: Math.min(times.length, endIndex) - clampedStart
            });
        }

        return blocks;
    }

    function renderAvatars(userIDs, compact) {
        const limit = compact ? COMPACT_AVATARS : MAX_AVATARS;

        return (
            <span className="calendar-block-avatars">
                {userIDs.slice(0, limit).map(id => {
                    const member = memberByID.get(id);

                    return (
                        <span
                            key={id}
                            className={`calendar-avatar ${id === user?.id ? 'is-me' : ''}`}
                            style={{ background: avatarColor(member) }}
                            title={member?.displayName ?? 'Member'}
                        >
                            {avatarLetter(member)}
                        </span>
                    );
                })}

                {userIDs.length > limit && (
                    <span className="calendar-avatar is-more">+{userIDs.length - limit}</span>
                )}
            </span>
        );
    }

    function renderDayColumn(day) {
        const segments = daySegments(day);
        const blocks = dayMeetingBlocks(day);

        return (
            <div className="calendar-day-col" key={day.getTime()}>
                {times.map((time, index) => (
                    <div
                        key={index}
                        className={`calendar-slot ${time.minute === 0 ? 'is-hour' : ''}`}
                        draggable={false}
                        onMouseDown={e => handleSlotDown(e, slotDate(day, time))}
                        onMouseEnter={() => handleSlotEnter(slotDate(day, time))}
                    />
                ))}

                {segments.map(segment => {
                    const start = slotDate(day, times[segment.startIndex]);
                    const end = new Date(start.getTime() + segment.span * SLOT_MS);
                    const everyone = members.length > 0 && segment.userIDs.length >= members.length;
                    const compact = segment.span * rowHeight < COMPACT_HEIGHT;

                    return (
                        <div
                            key={`${segment.startIndex}-${segment.key}`}
                            className={[
                                'calendar-block',
                                compact ? 'is-compact' : '',
                                everyone ? 'is-full' : '',
                                segment.userIDs.includes(user?.id) ? 'is-mine' : '',
                                draft && draftRange(draft)?.start.getTime() === start.getTime() ? 'is-selected' : ''
                            ].filter(Boolean).join(' ')}
                            style={{
                                top: `calc(var(--slot-h) * ${segment.startIndex})`,
                                height: `calc(var(--slot-h) * ${segment.span} - 2px)`,
                                background: blockBackground(segment.userIDs, memberByID)
                            }}
                            title={`${formatRange(start, end)} · ${segment.userIDs.length}/${memberCount} free`}
                        >
                            <span className="calendar-block-time">{formatRange(start, end)}</span>

                            {renderAvatars(segment.userIDs, compact)}

                            {canEdit && (
                                <button
                                    type="button"
                                    className="calendar-block-book"
                                    title="Lock this range as a meeting"
                                    aria-label="Lock this range as a meeting"
                                    onMouseDown={e => e.stopPropagation()}
                                    onClick={e => {
                                        e.stopPropagation();
                                        openDraft(start, segment.span * SLOT_MINUTES);
                                    }}
                                >
                                    <CalendarPlus size={13} strokeWidth={2.5} />
                                </button>
                            )}
                        </div>
                    );
                })}

                {blocks.map(({ meeting, startIndex, span }) => (
                    <div
                        key={meeting.id}
                        className={`calendar-meeting-block ${span * rowHeight < COMPACT_HEIGHT ? 'is-compact' : ''}`}
                        style={{
                            top: `calc(var(--slot-h) * ${startIndex})`,
                            height: `calc(var(--slot-h) * ${span} - 2px)`
                        }}
                        title={`${meeting.title} · ${formatRange(new Date(meeting.startsAt), new Date(meeting.endsAt))}`}
                    >
                        <span className="calendar-meeting-block-title">{meeting.title}</span>
                    </div>
                ))}
            </div>
        );
    }

    function renderWeek() {
        return (
            <div className="calendar-week">
                <div className="calendar-week-head">
                    <div className="calendar-gutter-head" />

                    {days.map(day => (
                        <div
                            key={day.getTime()}
                            className={`calendar-day-head ${sameDay(day, new Date()) ? 'is-today' : ''}`}
                        >
                            <span className="calendar-day-name">{WEEKDAYS[(day.getDay() + 6) % 7]}</span>
                            <span className="calendar-day-number">{day.getDate()}</span>
                        </div>
                    ))}
                </div>

                <div className="calendar-week-body">
                    <div className="calendar-gutter">
                        {hours.map(hour => (
                            <span className="calendar-hour" key={hour}>
                                {String(hour).padStart(2, '0')}:00
                            </span>
                        ))}
                    </div>

                    {days.map(day => renderDayColumn(day))}
                </div>

                <div
                    className={`calendar-resize ${resizing ? 'is-active' : ''}`}
                    role="separator"
                    aria-orientation="horizontal"
                    aria-label="Drag to resize rows"
                    title="Drag to resize rows"
                    onMouseDown={handleResizeDown}
                >
                    <span className="calendar-resize-grip" />
                </div>
            </div>
        );
    }

    function renderMonth() {
        return (
            <div className="calendar-month">
                <div className="calendar-month-head">
                    {WEEKDAYS.map(label => (
                        <span key={label} className="calendar-month-weekday">{label}</span>
                    ))}
                </div>

                <div className="calendar-month-grid">
                    {days.map(day => {
                        const stats = dayStats[startOfDay(day).getTime()];
                        const dayMeetings = meetingsByDay[startOfDay(day).getTime()] ?? [];
                        const ratio = stats ? stats.best / memberCount : 0;

                        return (
                            <button
                                type="button"
                                key={day.getTime()}
                                className={[
                                    'calendar-month-day',
                                    day.getMonth() === anchor.getMonth() ? '' : 'is-outside',
                                    sameDay(day, new Date()) ? 'is-today' : ''
                                ].filter(Boolean).join(' ')}
                                style={{ '--fill': ratio }}
                                onClick={() => { setAnchor(day); setView('week'); }}
                                title={stats
                                    ? `Best overlap ${stats.best}/${memberCount} across ${stats.slots} slots`
                                    : 'No availability marked'}
                            >
                                <span className="calendar-month-number">{day.getDate()}</span>

                                {stats && (
                                    <span className="calendar-month-overlap">{stats.best}/{memberCount}</span>
                                )}

                                {dayMeetings.length > 0 && (
                                    <span className="calendar-month-pips">
                                        {dayMeetings.slice(0, 3).map(meeting => (
                                            <span key={meeting.id} className="calendar-month-pip" />
                                        ))}
                                    </span>
                                )}
                            </button>
                        );
                    })}
                </div>
            </div>
        );
    }

    // derived variables
    const periodLabel = view === 'week'
        ? `${range.from.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} – ${addDays(range.from, 6).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}`
        : anchor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

    return (
        <div className="calendar-root" style={{ '--slot-h': `${rowHeight}px` }}>
            <div className="calendar-toolbar">
                <div className="calendar-toolbar-side">
                    {view === 'week' && (
                        <label className="calendar-zoom" title="Row height">
                            <Rows3 size={14} strokeWidth={2} />
                            <input
                                type="range"
                                className="calendar-zoom-input"
                                min={ROW_MIN}
                                max={ROW_MAX}
                                step={2}
                                value={rowHeight}
                                onChange={e => handleRowHeight(Number(e.target.value))}
                                aria-label="Row height"
                            />
                        </label>
                    )}
                </div>

                <div className="calendar-nav">
                    <button className="calendar-nav-btn" onClick={() => shiftAnchor(-1)} aria-label="Previous period">
                        <ChevronLeft size={16} strokeWidth={2} />
                    </button>

                    <span className="calendar-period">{periodLabel}</span>

                    <button className="calendar-nav-btn" onClick={() => shiftAnchor(1)} aria-label="Next period">
                        <ChevronRight size={16} strokeWidth={2} />
                    </button>
                </div>

                <div className="calendar-toolbar-side calendar-toolbar-side--end">
                    {canEdit && (
                        <button className="calendar-set-btn" onClick={() => openDraft()}>
                            <CalendarPlus size={14} strokeWidth={2} />
                            Set meeting
                        </button>
                    )}

                    <span className="calendar-views">
                        <button
                            className="calendar-view-btn calendar-view-btn--action"
                            onClick={() => setAnchor(startOfDay(new Date()))}
                        >
                            Today
                        </button>

                        <span className="calendar-views-divider" />

                        <button
                            className={`calendar-view-btn ${view === 'week' ? 'active' : ''}`}
                            onClick={() => setView('week')}
                        >
                            Week
                        </button>

                        <button
                            className={`calendar-view-btn ${view === 'month' ? 'active' : ''}`}
                            onClick={() => setView('month')}
                        >
                            Month
                        </button>
                    </span>
                </div>
            </div>

            {loading && <p className="calendar-status">Loading availability…</p>}

            {view === 'week' ? renderWeek() : renderMonth()}

            {draft && canEdit && (
                <div className="calendar-booking">
                    <div className="calendar-booking-fields">
                        <label className="calendar-field">
                            <span className="calendar-field-label">Date</span>
                            <input
                                type="date"
                                className="calendar-field-input"
                                value={draft.date}
                                onChange={e => setDraft({ ...draft, date: e.target.value })}
                            />
                        </label>

                        <label className="calendar-field">
                            <span className="calendar-field-label">Start</span>
                            <select
                                className="calendar-field-input"
                                value={draft.time}
                                onChange={e => setDraft({ ...draft, time: e.target.value })}
                            >
                                {times.map(time => {
                                    const value = `${String(time.hour).padStart(2, '0')}:${String(time.minute).padStart(2, '0')}`;
                                    return <option key={value} value={value}>{value}</option>;
                                })}
                            </select>
                        </label>

                        <label className="calendar-field">
                            <span className="calendar-field-label">Length</span>
                            <select
                                className="calendar-field-input"
                                value={draft.minutes}
                                onChange={e => setDraft({ ...draft, minutes: Number(e.target.value) })}
                            >
                                {DURATIONS.map(minutes => (
                                    <option key={minutes} value={minutes}>{formatDuration(minutes)}</option>
                                ))}
                            </select>
                        </label>

                        <label className="calendar-field calendar-field--grow">
                            <span className="calendar-field-label">Title</span>
                            <input
                                className="calendar-field-input"
                                placeholder="Meeting title"
                                value={draft.title}
                                onChange={e => setDraft({ ...draft, title: e.target.value })}
                            />
                        </label>
                    </div>

                    <div className="calendar-booking-actions">
                        <span className="calendar-booking-overlap">
                            {draftOverlap(draft).length}/{memberCount} free for the whole slot
                        </span>

                        <button className="calendar-booking-submit" onClick={handleBookMeeting}>
                            Set meeting
                        </button>

                        <button className="calendar-booking-cancel" onClick={() => setDraft(null)}>
                            Cancel
                        </button>
                    </div>
                </div>
            )}

            {meetings.length > 0 && (
                <div className="calendar-meetings">
                    <span className="calendar-meetings-title">Booked</span>

                    {meetings.map(meeting => (
                        <div className="calendar-meeting" key={meeting.id}>
                            <span className="calendar-meeting-when">
                                {new Date(meeting.startsAt).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}
                                {' · '}
                                {formatRange(new Date(meeting.startsAt), new Date(meeting.endsAt))}
                            </span>

                            <span className="calendar-meeting-title">{meeting.title}</span>

                            {canEdit && (
                                <button
                                    className="calendar-meeting-delete"
                                    onClick={() => setConfirmMeeting(meeting)}
                                    aria-label="Delete meeting"
                                >
                                    <Trash2 size={13} strokeWidth={2} />
                                </button>
                            )}
                        </div>
                    ))}
                </div>
            )}

            <ConfirmModal
                open={!!confirmMeeting}
                title="Delete meeting?"
                message={confirmMeeting ? `"${confirmMeeting.title}" will be removed for everyone.` : ''}
                confirmLabel="Delete"
                cancelLabel="Cancel"
                onConfirm={() => { deleteMeeting(confirmMeeting.id); setConfirmMeeting(null); }}
                onCancel={() => setConfirmMeeting(null)}
            />
        </div>
    );
}