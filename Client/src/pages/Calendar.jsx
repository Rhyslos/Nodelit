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
const DAY_START_HOUR = 9;
const DAY_END_HOUR = 21;
const MAX_AVATARS = 5;
const SLOT_PX = 24;
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

    function handleBookMeeting() {
        if (!selection) return;

        createMeeting({
            title: meetingTitle.trim() || 'Meeting',
            startsAt: selection.start,
            endsAt: selection.end
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

    function renderAvatars(userIDs) {
        return (
            <span className="calendar-block-avatars">
                {userIDs.slice(0, MAX_AVATARS).map(id => {
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

                {userIDs.length > MAX_AVATARS && (
                    <span className="calendar-avatar is-more">+{userIDs.length - MAX_AVATARS}</span>
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

                    return (
                        <div
                            key={`${segment.startIndex}-${segment.key}`}
                            className={[
                                'calendar-block',
                                everyone ? 'is-full' : '',
                                segment.userIDs.includes(user?.id) ? 'is-mine' : '',
                                selection?.start === start.toISOString() ? 'is-selected' : ''
                            ].filter(Boolean).join(' ')}
                            style={{
                                top: segment.startIndex * SLOT_PX,
                                height: segment.span * SLOT_PX - 2,
                                '--fill': segment.userIDs.length / memberCount
                            }}
                            title={`${formatRange(start, end)} · ${segment.userIDs.length}/${memberCount} free`}
                        >
                            <span className="calendar-block-time">{formatRange(start, end)}</span>

                            {renderAvatars(segment.userIDs)}

                            {canEdit && (
                                <button
                                    type="button"
                                    className="calendar-block-book"
                                    title="Lock this range as a meeting"
                                    aria-label="Lock this range as a meeting"
                                    onMouseDown={e => e.stopPropagation()}
                                    onClick={e => {
                                        e.stopPropagation();
                                        setSelection({
                                            start: start.toISOString(),
                                            end: end.toISOString(),
                                            userIDs: segment.userIDs
                                        });
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
                        className="calendar-meeting-block"
                        style={{ top: startIndex * SLOT_PX, height: span * SLOT_PX - 2 }}
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
            <div className="calendar-week" style={{ '--slot-h': `${SLOT_PX}px` }}>
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
                            {formatRange(new Date(selection.start), new Date(selection.end))}
                        </span>
                        <span className="calendar-booking-overlap">
                            {selection.userIDs.length}/{memberCount} free
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
