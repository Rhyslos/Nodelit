// context imports
import { createContext, useContext, useEffect, useMemo } from 'react';
import { useAuth } from './AuthContext';

// context initialization
const ThemeContext = createContext(null);

export const THEME_KEYS = ['navbar', 'subbar', 'background', 'surface', 'accent', 'text'];

export const THEME_LABELS = {
    navbar: 'Navbar',
    subbar: 'Subbar',
    background: 'Background',
    surface: 'Panels and cards',
    accent: 'Accent and edges',
    text: 'Text'
};

export const THEME_PRESETS = {
    default: {
        navbar: '#faf8f5',
        subbar: '#faf8f5',
        background: '#f5f2ee',
        surface: '#faf8f5',
        accent: '#c8502a',
        text: '#0f0e0d'
    },
    dark: {
        navbar: '#22262c',
        subbar: '#22262c',
        background: '#15171a',
        surface: '#1e2126',
        accent: '#5aa9e6',
        text: '#e8eaed'
    }
};

// colour functions
function parseHex(value) {
    const hex = value.replace('#', '');
    return [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16));
}

function toHex(channels) {
    return '#' + channels.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
}

function mix(from, to, ratio) {
    const a = parseHex(from);
    const b = parseHex(to);
    return toHex(a.map((value, index) => value * (1 - ratio) + b[index] * ratio));
}

function rgba(value, alpha) {
    const [r, g, b] = parseHex(value);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function resolveTheme(theme) {
    const mode = theme?.mode ?? 'default';

    if (mode === 'custom') {
        return { ...THEME_PRESETS.default, ...(theme?.custom ?? {}) };
    }

    return THEME_PRESETS[mode] ?? THEME_PRESETS.default;
}

export function buildVariables(palette) {
    return {
        '--ink': palette.text,
        '--paper': palette.background,
        '--panel': palette.surface,
        '--navbar-bg': palette.navbar,
        '--subbar-bg': palette.subbar,
        '--accent': palette.accent,
        '--accent-lt': mix(palette.surface, palette.accent, 0.16),
        '--muted': mix(palette.text, palette.background, 0.35),
        '--faint': mix(palette.text, palette.background, 0.55),
        '--border': mix(palette.surface, palette.text, 0.14),
        '--shadow': rgba(palette.text, 0.1)
    };
}

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

        root.style.colorScheme = palette.background === THEME_PRESETS.dark.background ? 'dark' : 'light';
    }, [palette]);

    return (
        <ThemeContext.Provider value={{ palette, mode: user?.theme?.mode ?? 'default' }}>
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
