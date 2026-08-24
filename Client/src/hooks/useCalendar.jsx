// hook imports
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { api } from '../lib/api';
import { useStream } from '../contexts/StreamContext';

// configuration constants
const SLOT_MINUTES = 30;

// hook functions
export function useCalendar(workspaceID, rangeStart, rangeEnd, userID) {
    const { subscribe } = useStream();

    // state variables
    const [slots, setSlots] = useState({});
    const [meetings, setMeetings] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // range references
    const fromISO = rangeStart.toISOString();
    const toISO = rangeEnd.toISOString();
    const rangeRef = useRef({ fromISO, toISO });
    rangeRef.current = { fromISO, toISO };

    // data fetching
    const refresh = useCallback(async () => {
        if (!workspaceID) return;

        try {
            const query = new URLSearchParams({ from: fromISO, to: toISO });
            const data = await api(`/api/calendar/${workspaceID}?${query}`);

            const next = {};
            for (const entry of data.slots) next[entry.slotStart] = entry.userIDs;

            setSlots(next);
            setMeetings(data.meetings);
            setError(null);
        } catch (err) {
            setError(err);
        } finally {
            setLoading(false);
        }
    }, [workspaceID, fromISO, toISO]);

    useEffect(() => {
        setLoading(true);
        refresh();
    }, [refresh]);

    // stream subscription
    useEffect(() => {
        if (!workspaceID) return;

        const stopCalendar = subscribe('calendar', event => {
            if (event.slots || event.cleared) {
                setSlots(current => {
                    const next = { ...current };

                    for (const entry of event.slots ?? []) next[entry.slotStart] = entry.userIDs;
                    for (const iso of event.cleared ?? []) delete next[iso];

                    return next;
                });
            }

            if (event.meetings) {
                setMeetings(current => {
                    const byID = new Map(current.map(meeting => [meeting.id, meeting]));
                    for (const meeting of event.meetings) byID.set(meeting.id, meeting);

                    return [...byID.values()].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
                });
            }

            if (event.removedMeetings) {
                const removed = new Set(event.removedMeetings);
                setMeetings(current => current.filter(meeting => !removed.has(meeting.id)));
            }
        });

        const stopReconnect = subscribe('reconnected', () => refresh());

        return () => {
            stopCalendar();
            stopReconnect();
        };
    }, [workspaceID, subscribe, refresh]);

    // mutation functions
    async function setAvailability(added, removed) {
        if (added.length === 0 && removed.length === 0) return;

        setSlots(current => {
            const next = { ...current };

            for (const iso of added) {
                const users = new Set(next[iso] ?? []);
                users.add(userID);
                next[iso] = [...users];
            }

            for (const iso of removed) {
                const users = (next[iso] ?? []).filter(id => id !== userID);
                if (users.length > 0) next[iso] = users;
                else delete next[iso];
            }

            return next;
        });

        try {
            const result = await api(`/api/calendar/${workspaceID}/availability`, {
                method: 'PUT',
                body: { added, removed }
            });

            setSlots(current => {
                const next = { ...current };

                for (const entry of result.slots) next[entry.slotStart] = entry.userIDs;
                for (const iso of result.cleared) delete next[iso];

                return next;
            });
        } catch (err) {
            console.error('setAvailability failed:', err);
            refresh();
        }
    }

    async function createMeeting(fields) {
        try {
            const meeting = await api(`/api/calendar/${workspaceID}/meetings`, {
                method: 'POST',
                body: fields
            });

            setMeetings(current => [...current, meeting].sort((a, b) => a.startsAt.localeCompare(b.startsAt)));
            return meeting;
        } catch (err) {
            console.error('createMeeting failed:', err);
            refresh();
            return null;
        }
    }

    async function updateMeeting(meetingID, fields) {
        setMeetings(current => current
            .map(meeting => meeting.id === meetingID ? { ...meeting, ...fields } : meeting)
            .sort((a, b) => a.startsAt.localeCompare(b.startsAt)));

        try {
            const meeting = await api(`/api/calendar/meetings/${meetingID}`, {
                method: 'PUT',
                body: fields
            });

            setMeetings(current => current
                .map(entry => entry.id === meeting.id ? meeting : entry)
                .sort((a, b) => a.startsAt.localeCompare(b.startsAt)));

            return meeting;
        } catch (err) {
            console.error('updateMeeting failed:', err);
            refresh();
            return null;
        }
    }

    async function deleteMeeting(meetingID) {
        setMeetings(current => current.filter(meeting => meeting.id !== meetingID));

        try {
            await api(`/api/calendar/meetings/${meetingID}`, { method: 'DELETE' });
        } catch (err) {
            console.error('deleteMeeting failed:', err);
            refresh();
        }
    }

    const slotMinutes = useMemo(() => SLOT_MINUTES, []);

    return {
        slots,
        meetings,
        loading,
        error,
        slotMinutes,
        refresh,
        setAvailability,
        createMeeting,
        updateMeeting,
        deleteMeeting
    };
}
