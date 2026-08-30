// hook imports
import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../lib/api';
import { useToast } from '../contexts/ToastContext';
import { useStream } from '../contexts/StreamContext';

// configuration constants
const DEFAULT_WEEKS = 26;
const REFRESH_DELAY = 1500;

// hook functions
export function useWorkspaceStats(workspaceID, weeks = DEFAULT_WEEKS) {
    const { notifyError } = useToast();
    const { subscribe } = useStream();

    // state variables
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);

    // request references
    const timer = useRef(null);
    const inFlight = useRef(null);

    // data fetching
    const load = useCallback(async () => {
        if (!workspaceID) {
            setStats(null);
            setLoading(false);
            return;
        }

        inFlight.current?.abort();

        const controller = new AbortController();
        inFlight.current = controller;

        try {
            const data = await api(
                `/api/kanban/${workspaceID}/stats?weeks=${weeks}`,
                { signal: controller.signal }
            );

            setStats(data);
        } catch (error) {
            if (error?.name === 'AbortError') return;

            notifyError(error, 'Could not load the overview');
            setStats(null);
        } finally {
            if (inFlight.current === controller) {
                inFlight.current = null;
                setLoading(false);
            }
        }
    }, [workspaceID, weeks, notifyError]);

    const schedule = useCallback(() => {
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => {
            timer.current = null;
            load();
        }, REFRESH_DELAY);
    }, [load]);

    // lifecycle functions
    useEffect(() => {
        setLoading(true);
        load();

        return () => {
            if (timer.current) clearTimeout(timer.current);
            inFlight.current?.abort();
        };
    }, [load]);

    useEffect(() => {
        const stopKanban = subscribe('kanban', schedule);
        const stopReconnect = subscribe('reconnected', schedule);

        return () => {
            stopKanban();
            stopReconnect();
        };
    }, [subscribe, schedule]);

    return { stats, loading, reload: load };
}
