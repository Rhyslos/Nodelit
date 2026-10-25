// context imports
import { createContext, useContext, useEffect, useMemo } from 'react';
import { useAuth } from './AuthContext';
import { resolveTheme, buildVariables, luminance } from '../lib/theme';

// context initialization
const ThemeContext = createContext(null);

// context providers
export function ThemeProvider({ children }) {
    const { user } = useAuth();

    const palette = useMemo(() => resolveTheme(user?.theme), [user?.theme]);

    useEffect(() => {
        const root = document.documentElement;
        const variables = buildVariables(palette);

        for (const [key, value] of Object.entries(variables)) {
            root.style.setProperty(key, value);
        }

        root.style.colorScheme = luminance(palette.background) < 0.4 ? 'dark' : 'light';
    }, [palette]);

    return (
        <ThemeContext.Provider value={{ palette, mode: user?.theme?.mode ?? 'default', isDark: luminance(palette.background) < 0.4 }}>
            {children}
        </ThemeContext.Provider>
    );
}

// hook exports
export function useTheme() {
    const context = useContext(ThemeContext);

    if (!context) {
        throw new Error('useTheme must be used inside a ThemeProvider');
    }

    return context;
}