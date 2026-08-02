// context imports
import { useState, createContext, useContext } from 'react';

// context initialization
const AuthContext = createContext(null);

// context providers
export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);

    // authentication requests
    async function login(username, password) {
        const response = await fetch('http://localhost:3000/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password }),
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || 'Invalid credentials');
        }

        const userData = await response.json();
        setUser(userData);
        return userData;
    }

    // session management
    function logout() {
        setUser(null);
    }

    return (
        <AuthContext.Provider value={{ user, login, logout }}>
            {children}
        </AuthContext.Provider>
    );
}

// hook exports
export function useAuth() {
    return useContext(AuthContext);
}