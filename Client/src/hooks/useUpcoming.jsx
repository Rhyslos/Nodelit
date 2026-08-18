// hook imports
import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';

// configuration constants
const DEFAULT_WINDOW_DAYS = 7;

// utility functions
function startOfDay(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function parseDateOnly(value) {
    const [year, month, day] = String(value).split('-').map(Number);
    if (!year || !month || !day) return null;

    return new Date(year, month - 1, day);
}

function decorate(item) {
    const today = startOfDay(new Date());

    if (item.kind === 'meeting') {
        const starts = new Date(item.startsAt);
        const days = Math.round((startOfDay(starts) - today) / 86400000);

        return { ...item, sortAt: starts.getTime(), daysRemaining: days };
    }

    const due = parseDateOnly(item.deadline);

    return {
        ...item,
        sortAt: due ? due.getTime() : Number.MAX_SAFE_INTEGER,
        daysRemaining: item.daysRemaining
    };
}

// hook functions
export function useUpcoming(userID, days = DEFAULT_WINDOW_DAYS) {
    // state variables
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // data fetching
    const load = useCallback(async () => {
        if (!userID) {
            setItems([]);
            setLoading(false);
            return;
        }

        try {
            const data = await api(`/api/workspaces/upcoming?days=${days}`);

            setItems(data.items.map(decorate).sort((a, b) => a.sortAt - b.sortAt));
            setError(null);
        } catch (err) {
            setError(err);
            setItems([]);
        } finally {
            setLoading(false);
        }
    }, [userID, days]);

    useEffect(() => {
        setLoading(true);
        load();
    }, [load]);

    return { items, loading, error, reload: load };
}
