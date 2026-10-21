// component imports
import { useState, useMemo, useEffect, useLayoutEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, CalendarPlus, CalendarClock, Pencil, Trash2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useKanban } from '../contexts/KanbanContext';
import { useWorkspacePresence } from '../hooks/useWorkspacePresence';
import { useCalendar } from '../hooks/useCalendar';
import ConfirmModal from '../components/kanban/ConfirmModal';
import MeetingTimer from '../components/MeetingTimer';
import { useNow } from '../hooks/useNow';

// configuration constants
const SLOT_MINUTES = 30;
const SLOT_MS = SLOT_MINUTES * 60 * 1000;
const DAY_START_HOUR = 9;
const DAY_END_HOUR = 21;
const MAX_AVATARS = 5;
const DURATIONS = [30, 60, 90, 120, 180];
const ROW_STORAGE_KEY = 'nodelit:calendarrowheight';
const DEADLINE_STORAGE_KEY = 'nodelit:calendardeadlines';
const MONTH_DEADLINE_LIMIT = 3;
const ROW_MIN = 20;
const ROW_MAX = 72;
const ROW_DEFAULT = 32;
const COMPACT_HEIGHT = 46;
const COMPACT_AVATARS = 3;
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const OVERLAP_COLOR = '#16a34a';
const OVERLAP_MIN_STRENGTH = 28;
const OVERLAP_MAX_STRENGTH = 78;
const SINGLE_STRENGTH = 30;
const NOW_TICK_MS = 30000;

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

function memberName(member) {
    return member?.displayName || member?.username || 'Member';
}

// one person: their own colour; two or more: green, stronger the more people overlap
function blockColors(userIDs, memberByID, memberCount) {
    if (userIDs.length === 0) return {};

    if (userIDs.length === 1) {
        const color = avatarColor(memberByID.get(userIDs[0]));

        return {
            background: `color-mix(in srgb, ${color} ${SINGLE_STRENGTH}%, var(--panel))`,
            borderColor: `color-mix(in srgb, ${color} 75%, var(--panel))`
        };
    }

    const ratio = memberCount > 2
        ? Math.min(1, (userIDs.length - 2) / (memberCount - 2))
        : 1;
    const strength = Math.round(OVERLAP_MIN_STRENGTH + ratio * (OVERLAP_MAX_STRENGTH - OVERLAP_MIN_STRENGTH));

    return {
        background: `color-mix(in srgb, ${OVERLAP_COLOR} ${strength}%, var(--panel))`,
        borderColor: OVERLAP_COLOR
    };
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

function persistRowHeight(value) {
    try {
        localStorage.setItem(ROW_STORAGE_KEY, String(value));
    } catch {
        return;
    }
}

function parseDeadline(value) {
    const [year, month, day] = String(value).split('-').map(Number);
    if (!year || !month || !day) return null;

    return new Date(year, month - 1, day);
}

function readDeadlinePrefs() {
    try {
        const stored = JSON.parse(localStorage.getItem(DEADLINE_STORAGE_KEY) ?? '{}');
        return { show: stored.show === true, assignee: stored.assignee ?? 'all' };
    } catch {
        return { show: false, assignee: 'all' };
    }
}

function persistDeadlinePrefs(show, assignee) {
    try {
        localStorage.setItem(DEADLINE_STORAGE_KEY, JSON.stringify({ show, assignee }));
    } catch {
        return;
    }
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
    const { canEdit, boardData } = useKanban();
    const { members } = useWorkspacePresence(workspaceID);

    // state variables
    const [view, setView] = useState('week');
    const [anchor, setAnchor] = useState(() => startOfDay(new Date()));
    const [draft, setDraft] = useState(null);
    const [rowHeight, setRowHeight] = useState(readRowHeight);
    const [resizing, setResizing] = useState(false);
    const [confirmMeeting, setConfirmMeeting] = useState(null);
    const [deadlinePrefs, setDeadlinePrefs] = useState(readDeadlinePrefs);
    const now = useNow(NOW_TICK_MS);

    // drag references
    const paintRef = useRef(null);
    const resizeRef = useRef(null);
    const rowHeightRef = useRef(rowHeight);
    const [pending, setPending] = useState({ added: new Set(), removed: new Set() });
    const pendingRef = useRef(pending);

    useLayoutEffect(() => {
        rowHeightRef.current = rowHeight;
        pendingRef.current = pending;
    }, [rowHeight, pending]);

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
        setAvailability,
        createMeeting,
        updateMeeting,
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

    const draftTime = draft?.time;
    const draftMinutes = draft?.minutes;

    const timeOptions = useMemo(() => {
        const base = times.map(time =>
            `${String(time.hour).padStart(2, '0')}:${String(time.minute).padStart(2, '0')}`);

        if (draftTime && !base.includes(draftTime)) return [...base, draftTime].sort();

        return base;
    }, [times, draftTime]);

    const durationOptions = useMemo(() => {
        if (draftMinutes !== undefined && !DURATIONS.includes(draftMinutes)) {
            return [...DURATIONS, draftMinutes].sort((a, b) => a - b);
        }

        return DURATIONS;
    }, [draftMinutes]);

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

    const tabByList = useMemo(() => {
        const tabs = new Map(boardData.tabs.map(tab => [tab.id, tab]));
        return new Map(boardData.lists.map(list => [list.id, tabs.get(list.tabID) ?? null]));
    }, [boardData.tabs, boardData.lists]);

    // falls back to everyone when the chosen member has left the workspace
    const assignee = deadlinePrefs.assignee !== 'all'
        && members.length > 0
        && !members.some(member => member.id === deadlinePrefs.assignee)
        ? 'all'
        : deadlinePrefs.assignee;

    const deadlinesByDay = useMemo(() => {
        if (!deadlinePrefs.show) return {};

        const map = {};

        for (const task of boardData.tasks) {
            if (!task.deadline) continue;

            if (assignee !== 'all'
                && !(task.assignedUsers ?? []).includes(assignee)) continue;

            const tab = tabByList.get(task.listID);
            if (tab?.isArchived) continue;

            const date = parseDeadline(task.deadline);
            if (!date) continue;

            const key = date.getTime();
            if (!map[key]) map[key] = [];

            map[key].push({
                id: task.id,
                title: task.title,
                isCompleted: task.isCompleted,
                tabName: tab?.name ?? 'Board',
                tabColor: tab?.color ?? null
            });
        }

        for (const entries of Object.values(map)) {
            entries.sort((a, b) =>
                Number(a.isCompleted) - Number(b.isCompleted) || a.title.localeCompare(b.title));
        }

        return map;
    }, [boardData.tasks, tabByList, deadlinePrefs.show, assignee]);

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

    useEffect(() => {
        persistDeadlinePrefs(deadlinePrefs.show, deadlinePrefs.assignee);
    }, [deadlinePrefs]);


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

    function openEdit(meeting) {
        const start = new Date(meeting.startsAt);
        const end = new Date(meeting.endsAt);

        setDraft({
            id: meeting.id,
            date: toDateValue(start),
            time: toTimeValue(start),
            minutes: Math.max(SLOT_MINUTES, Math.round((end.getTime() - start.getTime()) / 60000)),
            title: meeting.title
        });
    }

    function handleBookMeeting() {
        const range = draftRange(draft);
        if (!range) return;

        const payload = {
            title: draft.title.trim() || 'Meeting',
            startsAt: range.start.toISOString(),
            endsAt: range.end.toISOString()
        };

        if (draft.id) updateMeeting(draft.id, payload);
        else createMeeting(payload);

        setDraft(null);
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

    function renderDeadline(task) {
        return (
            <span
                key={task.id}
                className={`calendar-deadline ${task.isCompleted ? 'is-done' : ''}`}
                style={{ '--tab-color': task.tabColor || 'var(--border)' }}
                title={`${task.title || 'Untitled task'} · ${task.tabName}${task.isCompleted ? ' · completed' : ''}`}
            >
                {task.title || 'Untitled task'}
            </span>
        );
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

    function renderNames(userIDs) {
        return (
            <span className="calendar-block-names">
                {userIDs.map(id => {
                    const member = memberByID.get(id);

                    return (
                        <span
                            key={id}
                            className={`calendar-name ${id === user?.id ? 'is-me' : ''}`}
                            style={{ '--member-color': avatarColor(member) }}
                        >
                            {memberName(member)}
                        </span>
                    );
                })}
            </span>
        );
    }

    function renderNowLine(day) {
        if (!sameDay(day, now)) return null;

        const minutes = now.getHours() * 60 + now.getMinutes() - DAY_START_HOUR * 60;
        const total = (DAY_END_HOUR - DAY_START_HOUR) * 60;

        if (minutes < 0 || minutes > total) return null;

        return (
            <div
                className="calendar-now"
                style={{ top: `calc(var(--slot-h) * ${minutes / SLOT_MINUTES})` }}
                title={`Now · ${formatTime(now)}`}
                aria-hidden="true"
            />
        );
    }

    function renderDayColumn(day) {
        const segments = daySegments(day);
        const blocks = dayMeetingBlocks(day);

        return (
            <div className={`calendar-day-col ${sameDay(day, now) ? 'is-today' : ''}`} key={day.getTime()}>
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
                    const overlap = segment.userIDs.length > 1;
                    const names = segment.userIDs.map(id => memberName(memberByID.get(id))).join(', ');

                    return (
                        <div
                            key={`${segment.startIndex}-${segment.key}`}
                            className={[
                                'calendar-block',
                                compact ? 'is-compact' : '',
                                overlap ? 'is-overlap' : '',
                                everyone ? 'is-full' : '',
                                segment.userIDs.includes(user?.id) ? 'is-mine' : '',
                                draft && draftRange(draft)?.start.getTime() === start.getTime() ? 'is-selected' : ''
                            ].filter(Boolean).join(' ')}
                            style={{
                                top: `calc(var(--slot-h) * ${segment.startIndex})`,
                                height: `calc(var(--slot-h) * ${segment.span} - 2px)`,
                                ...blockColors(segment.userIDs, memberByID, memberCount)
                            }}
                            title={`${formatRange(start, end)} · ${segment.userIDs.length}/${memberCount} free · ${names}`}
                        >
                            <span className="calendar-block-time">
                                {formatRange(start, end)}
                                {overlap && <span className="calendar-block-count">{segment.userIDs.length}/{memberCount}</span>}
                            </span>

                            {overlap ? renderNames(segment.userIDs) : renderAvatars(segment.userIDs, compact)}

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
                        <span className="calendar-meeting-block-body">
                            <span className="calendar-meeting-block-time">
                                {formatRange(new Date(meeting.startsAt), new Date(meeting.endsAt))}
                            </span>

                            <span className="calendar-meeting-block-title">{meeting.title}</span>

                            <MeetingTimer
                                startsAt={meeting.startsAt}
                                endsAt={meeting.endsAt}
                                className="calendar-meeting-block-timer"
                            />
                        </span>

                        {canEdit && (
                            <button
                                type="button"
                                className="calendar-meeting-block-edit"
                                title="Edit meeting"
                                aria-label="Edit meeting"
                                onMouseDown={e => e.stopPropagation()}
                                onClick={e => { e.stopPropagation(); openEdit(meeting); }}
                            >
                                <Pencil size={12} strokeWidth={2.5} />
                            </button>
                        )}
                    </div>
                ))}

                {renderNowLine(day)}
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

                {deadlinePrefs.show && (
                    <div className="calendar-deadline-row">
                        <span className="calendar-deadline-gutter">Due</span>

                        {days.map(day => (
                            <div className="calendar-deadline-cell" key={day.getTime()}>
                                {(deadlinesByDay[startOfDay(day).getTime()] ?? []).map(renderDeadline)}
                            </div>
                        ))}
                    </div>
                )}

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
                        const dayDeadlines = deadlinesByDay[startOfDay(day).getTime()] ?? [];
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

                                {dayDeadlines.length > 0 && (
                                    <span className="calendar-month-deadlines">
                                        {dayDeadlines.slice(0, MONTH_DEADLINE_LIMIT).map(renderDeadline)}

                                        {dayDeadlines.length > MONTH_DEADLINE_LIMIT && (
                                            <span className="calendar-deadline is-more">
                                                +{dayDeadlines.length - MONTH_DEADLINE_LIMIT} more
                                            </span>
                                        )}
                                    </span>
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
    const bookedMeetings = [...meetings].sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt));

    const periodLabel = view === 'week'
        ? `${range.from.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} – ${addDays(range.from, 6).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}`
        : anchor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

    return (
        <div className="calendar-root" style={{ '--slot-h': `${rowHeight}px` }}>
            <div className="calendar-toolbar">
                <div className="calendar-toolbar-side">
                    <span className="calendar-views">
                        <button
                            className={`calendar-view-btn ${deadlinePrefs.show ? 'active' : ''}`}
                            aria-pressed={deadlinePrefs.show}
                            onClick={() => setDeadlinePrefs(current => ({ ...current, show: !current.show }))}
                        >
                            <CalendarClock size={14} strokeWidth={2} />
                            Deadlines
                        </button>
                    </span>

                    {deadlinePrefs.show && (
                        <select
                            className="calendar-assignee"
                            aria-label="Filter deadlines by assignee"
                            value={assignee}
                            onChange={e => setDeadlinePrefs(current => ({ ...current, assignee: e.target.value }))}
                        >
                            <option value="all">Everyone</option>

                            {members.map(member => (
                                <option key={member.id} value={member.id}>
                                    {member.displayName}
                                </option>
                            ))}
                        </select>
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
                    <span className="calendar-booking-head">
                        {draft.id ? 'Edit meeting' : 'New meeting'}
                    </span>

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
                                {timeOptions.map(value => (
                                    <option key={value} value={value}>{value}</option>
                                ))}
                            </select>
                        </label>

                        <label className="calendar-field">
                            <span className="calendar-field-label">Length</span>
                            <select
                                className="calendar-field-input"
                                value={draft.minutes}
                                onChange={e => setDraft({ ...draft, minutes: Number(e.target.value) })}
                            >
                                {durationOptions.map(minutes => (
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
                            {draft.id ? 'Save changes' : 'Set meeting'}
                        </button>

                        <button className="calendar-booking-cancel" onClick={() => setDraft(null)}>
                            Cancel
                        </button>
                    </div>
                </div>
            )}

            {bookedMeetings.length > 0 && (
                <div className="calendar-meetings">
                    <span className="calendar-meetings-title">
                        Booked
                        <span className="calendar-meetings-count">{bookedMeetings.length}</span>
                    </span>

                    {bookedMeetings.map(meeting => (
                        <div
                            className={`calendar-meeting ${new Date(meeting.endsAt) <= now ? 'is-ended' : ''}`}
                            key={meeting.id}
                        >
                            <span className="calendar-meeting-when">
                                {new Date(meeting.startsAt).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}
                                {' · '}
                                {formatRange(new Date(meeting.startsAt), new Date(meeting.endsAt))}
                            </span>

                            <span className="calendar-meeting-title">{meeting.title}</span>

                            <MeetingTimer startsAt={meeting.startsAt} endsAt={meeting.endsAt} />

                            {canEdit && (
                                <button
                                    className="calendar-meeting-edit"
                                    onClick={() => openEdit(meeting)}
                                    aria-label="Edit meeting"
                                    title="Edit meeting"
                                >
                                    <Pencil size={13} strokeWidth={2} />
                                </button>
                            )}

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
