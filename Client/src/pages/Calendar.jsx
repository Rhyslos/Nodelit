// component imports
import { useState, useMemo, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, CalendarPlus, Trash2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useKanban } from '../contexts/KanbanContext';
import { useWorkspacePresence } from '../hooks/useWorkspacePresence';
import { useCalendar } from '../hooks/useCalendar';
import ConfirmModal from '../components/kanban/ConfirmModal';

// configuration constants
const SLOT_MINUTES = 30;
const SLOT_MS = SLOT_MINUTES * 60 * 1000;
const DAY_START_HOUR = 7;
const DAY_END_HOUR = 21;
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

// component functions
export default function Calendar() {
    const { workspaceID } = useParams();
    const { user } = useAuth();
    const { canEdit } = useKanban();
    const { members } = useWorkspacePresence(workspaceID);

    // state variables
    const [view, setView] = useState('week');
    const [anchor, setAnchor] = useState(() => startOfDay(new Date()));
    const [selection, setSelection] = useState(null);
    const [confirmMeeting, setConfirmMeeting] = useState(null);
    const [meetingTitle, setMeetingTitle] = useState('');

    // drag references
    const paintRef = useRef(null);
    const [pending, setPending] = useState({ added: new Set(), removed: new Set() });

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
        function handleUp() {
            if (!paintRef.current) return;

            paintRef.current = null;

            setPending(current => {
                const added = [...current.added];
                const removed = [...current.removed];

                if (added.length > 0 || removed.length > 0) setAvailability(added, removed);

                return { added: new Set(), removed: new Set() };
            });
        }

        window.addEventListener('mouseup', handleUp);
        return () => window.removeEventListener('mouseup', handleUp);
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

    function meetingAt(date) {
        const time = date.getTime();

        return meetings.find(meeting => {
            const start = new Date(meeting.startsAt).getTime();
            const end = new Date(meeting.endsAt).getTime();
            return time >= start && time < end;
        }) ?? null;
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

    function handleSlotDown(date) {
        if (!canEdit) return;

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

    function handleBookMeeting() {
        if (!selection) return;

        const start = new Date(selection);
        const end = new Date(start.getTime() + SLOT_MS);

        createMeeting({
            title: meetingTitle.trim() || 'Meeting',
            startsAt: start.toISOString(),
            endsAt: end.toISOString()
        });

        setSelection(null);
        setMeetingTitle('');
    }

    function shiftAnchor(direction) {
        if (view === 'week') {
            setAnchor(previous => addDays(previous, direction * 7));
            return;
        }

        setAnchor(previous => new Date(previous.getFullYear(), previous.getMonth() + direction, 1));
    }

    // render functions
    function renderWeek() {
        return (
            <div className="calendar-week">
                <div className="calendar-week-head">
                    <div className="calendar-gutter" />

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
                    {times.map(time => (
                        <div className="calendar-row" key={`${time.hour}:${time.minute}`}>
                            <div className="calendar-gutter">
                                {time.minute === 0 && (
                                    <span className="calendar-gutter-label">
                                        {String(time.hour).padStart(2, '0')}:00
                                    </span>
                                )}
                            </div>

                            {days.map(day => {
                                const date = slotDate(day, time);
                                const users = slotUsers(date);
                                const mine = users.includes(user?.id);
                                const meeting = meetingAt(date);
                                const ratio = users.length / memberCount;

                                return (
                                    <div
                                        key={date.getTime()}
                                        className={[
                                            'calendar-slot',
                                            mine ? 'is-mine' : '',
                                            meeting ? 'is-booked' : '',
                                            selection === slotKey(date) ? 'is-selected' : ''
                                        ].filter(Boolean).join(' ')}
                                        style={{ '--fill': ratio }}
                                        title={meeting
                                            ? `${meeting.title} · ${formatRange(new Date(meeting.startsAt), new Date(meeting.endsAt))}`
                                            : `${users.length}/${memberCount} free · ${formatTime(date)}`}
                                        onMouseDown={() => handleSlotDown(date)}
                                        onMouseEnter={() => handleSlotEnter(date)}
                                        onClick={() => setSelection(slotKey(date))}
                                    >
                                        {users.length > 0 && (
                                            <span className="calendar-slot-count">{users.length}</span>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    ))}
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

    const selectedUsers = selection ? (slots[selection] ?? []) : [];

    return (
        <div className="calendar-root">
            <div className="calendar-toolbar">
                <div className="calendar-nav">
                    <button className="calendar-nav-btn" onClick={() => shiftAnchor(-1)} aria-label="Previous">
                        <ChevronLeft size={16} strokeWidth={2} />
                    </button>

                    <button className="calendar-today-btn" onClick={() => setAnchor(startOfDay(new Date()))}>
                        Today
                    </button>

                    <button className="calendar-nav-btn" onClick={() => shiftAnchor(1)} aria-label="Next">
                        <ChevronRight size={16} strokeWidth={2} />
                    </button>

                    <span className="calendar-period">{periodLabel}</span>
                </div>

                <div className="calendar-views">
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
                </div>
            </div>

            {loading && <p className="calendar-status">Loading availability…</p>}

            {view === 'week' ? renderWeek() : renderMonth()}

            {view === 'week' && selection && canEdit && (
                <div className="calendar-booking">
                    <div className="calendar-booking-info">
                        <span className="calendar-booking-time">
                            {formatRange(new Date(selection), new Date(new Date(selection).getTime() + SLOT_MS))}
                        </span>
                        <span className="calendar-booking-overlap">
                            {selectedUsers.length}/{memberCount} free
                        </span>
                    </div>

                    <input
                        className="calendar-booking-title"
                        placeholder="Meeting title"
                        value={meetingTitle}
                        onChange={e => setMeetingTitle(e.target.value)}
                    />

                    <button className="calendar-booking-submit" onClick={handleBookMeeting}>
                        <CalendarPlus size={14} strokeWidth={2} />
                        Book meeting
                    </button>

                    <button className="calendar-booking-cancel" onClick={() => setSelection(null)}>
                        Cancel
                    </button>
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
