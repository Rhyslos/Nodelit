// hook imports
import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';
import { useToast } from '../contexts/ToastContext';

// configuration constants
const DEFAULT_WEEKS = 26;

// hook functions
export function useWorkspaceStats(workspaceID, weeks = DEFAULT_WEEKS) {
    const { notifyError } = useToast();

    // state variables
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);

    // data fetching
    const load = useCallback(async () => {
        if (!workspaceID) {
            setStats(null);
            setLoading(false);
            return;
        }

        try {
            const data = await api(`/api/kanban/${workspaceID}/stats?weeks=${weeks}`);
            setStats(data);
        } catch (error) {
            notifyError(error, 'Could not load the overview');
            setStats(null);
        } finally {
            setLoading(false);
        }
    }, [workspaceID, weeks, notifyError]);

    useEffect(() => {
        setLoading(true);
        load();
    }, [load]);

    return { stats, loading, reload: load };
}
