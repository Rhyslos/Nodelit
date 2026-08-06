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

    // session restoration
    useEffect(() => {
        let active = true;

        api('/api/auth/session')
            .then(data => { if (active) setUser(data); })
            .catch(() => { if (active) setUser(null); })
            .finally(() => { if (active) setLoading(false); });

        return () => { active = false; };
    }, []);

    useEffect(() => onUnauthorized(() => setUser(null)), []);

    // authentication requests
    const login = useCallback(async (username, password) => {
        const userData = await api('/api/auth/login', {
            method: 'POST',
            body: { username, password }
        });

        setUser(userData);
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
        <AuthContext.Provider value={{ user, loading, login, logout, updateUser }}>
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
