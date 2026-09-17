// context imports
import { useState, useEffect, useCallback, createContext, useContext } from 'react';
import { api, onUnauthorized } from '../lib/api';

// context initialization
const AuthContext = createContext(null);

// context providers
export function AuthProvider({ children }) {
    // state variables
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [restoreError, setRestoreError] = useState(null);
    const [restoreAttempt, setRestoreAttempt] = useState(0);

    // session restoration
    useEffect(() => {
        let active = true;

        setLoading(true);

        api('/api/auth/session')
            .then(data => {
                if (!active) return;
                setUser(data);
                setRestoreError(null);
            })
            .catch(err => {
                if (!active) return;
                setUser(null);
                setRestoreError(err?.status === 401 ? null : err);
            })
            .finally(() => { if (active) setLoading(false); });

        return () => { active = false; };
    }, [restoreAttempt]);

    const retryRestore = useCallback(() => setRestoreAttempt(value => value + 1), []);

    useEffect(() => onUnauthorized(() => setUser(null)), []);

    // authentication requests
    const login = useCallback(async (username, password) => {
        const userData = await api('/api/auth/login', {
            method: 'POST',
            body: { username, password }
        });

        setUser(userData);
        setRestoreError(null);
        return userData;
    }, []);

    const logout = useCallback(async () => {
        try {
            await api('/api/auth/logout', { method: 'POST' });
        } finally {
            setUser(null);
        }
    }, []);

    const updateUser = useCallback(next => setUser(next), []);

    return (
        <AuthContext.Provider value={{ user, loading, restoreError, retryRestore, login, logout, updateUser }}>
            {children}
        </AuthContext.Provider>
    );
}

// hook exports
export function useAuth() {
    const context = useContext(AuthContext);

    if (!context) {
        throw new Error('useAuth must be used inside an AuthProvider');
    }

    return context;
}
