// hook imports
import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';

// hook functions
export function useWorkspaces(userID) {
    // state variables
    const [workspaces, setWorkspaces] = useState([]);
    const [categories, setCategories] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // data fetching
    const load = useCallback(async () => {
        if (!userID) {
            setWorkspaces([]);
            setCategories([]);
            setLoading(false);
            return;
        }

        try {
            const data = await api('/api/workspaces');
            setWorkspaces(data.workspaces);
            setCategories(data.categories);
            setError(null);
        } catch (err) {
            setError(err);
        } finally {
            setLoading(false);
        }
    }, [userID]);

    useEffect(() => {
        setLoading(true);
        load();
    }, [load]);

    // mutation functions
    const createWorkspace = useCallback(async (name, categoryID) => {
        const workspace = await api('/api/workspaces', {
            method: 'POST',
            body: { name, categoryID: categoryID ?? null }
        });

        setWorkspaces(prev => [workspace, ...prev]);
        return workspace;
    }, []);

    const deleteWorkspace = useCallback(async workspaceID => {
        const previous = workspaces;
        setWorkspaces(prev => prev.filter(w => w.id !== workspaceID));

        try {
            await api(`/api/workspaces/${workspaceID}`, { method: 'DELETE' });
        } catch (err) {
            setWorkspaces(previous);
            throw err;
        }
    }, [workspaces]);

    const createCategory = useCallback(async (name, color) => {
        const category = await api('/api/workspaces/categories', {
            method: 'POST',
            body: { name, color }
        });

        setCategories(prev => [...prev, category]);
        return category;
    }, []);

    return { workspaces, categories, loading, error, createWorkspace, deleteWorkspace, createCategory, reload: load };
}
