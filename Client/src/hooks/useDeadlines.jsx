// hook imports
import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';

// configuration constants
const DEFAULT_WINDOW_DAYS = 7;

// hook functions
export function useDeadlines(userID, days = DEFAULT_WINDOW_DAYS) {
    // state variables
    const [deadlines, setDeadlines] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // data fetching
    const load = useCallback(async () => {
        if (!userID) {
            setDeadlines([]);
            setLoading(false);
            return;
        }

        try {
            const data = await api(`/api/workspaces/deadlines?days=${days}`);
            setDeadlines(data.deadlines);
            setError(null);
        } catch (err) {
            setError(err);
            setDeadlines([]);
        } finally {
            setLoading(false);
        }
    }, [userID, days]);

    useEffect(() => {
        setLoading(true);
        load();
    }, [load]);

    return { deadlines, loading, error, reload: load };
}
