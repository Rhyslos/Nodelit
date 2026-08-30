// hook imports
import { useCallback } from 'react';
import { api } from '../lib/api';
import { normalizeHex } from '../lib/color';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';

// configuration constants
const MAX_PALETTE_COLORS = 12;

// hook functions
export function usePalette() {
    const { notifyError } = useToast();

    const { user, updateUser } = useAuth();

    const palette = user?.palette ?? [];

    const persist = useCallback(async next => {
        updateUser({ ...user, palette: next });

        try {
            const updated = await api('/api/auth/profile', { method: 'PUT', body: { palette: next } });
            updateUser(updated);
        } catch (error) {
            notifyError(error, 'Could not save your palette');
            updateUser(user);
        }
    }, [user, updateUser, notifyError]);

    const saveColor = useCallback(hex => {
        const parsed = normalizeHex(hex);
        if (!parsed) return;

        const current = user?.palette ?? [];
        if (current.includes(parsed)) return;

        persist([...current, parsed].slice(-MAX_PALETTE_COLORS));
    }, [user, persist]);

    const forgetColor = useCallback(hex => {
        const current = user?.palette ?? [];
        persist(current.filter(entry => entry !== hex));
    }, [user, persist]);

    return { palette, saveColor, forgetColor };
}
