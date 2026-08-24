// configuration constants
export const HEX_PATTERN = /^#[0-9a-fA-F]{6}$/;

export const PALETTE = [
    '#c8502a', '#e07a3f', '#e6a817', '#7ab648', '#16a085', '#4a90d9',
    '#6c8ebf', '#5b6bbf', '#9b59b6', '#e84393', '#7a6a58', '#3f4650'
];

export const PASTEL_PALETTE = [
    '#ffb3b3', '#ffd0a8', '#fff0a8', '#b8f0c8', '#a8e6e0', '#b3d8ff',
    '#c3ccf5', '#e8b3ff', '#ffb3d9', '#e6d9c7', '#d8dde3', '#ffffff'
];

// utility functions
export function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

export function normalizeHex(value) {
    if (typeof value !== 'string') return null;

    let hex = value.trim();
    if (!hex.startsWith('#')) hex = `#${hex}`;

    if (/^#[0-9a-fA-F]{3}$/.test(hex)) {
        hex = `#${hex.slice(1).split('').map(part => part + part).join('')}`;
    }

    return HEX_PATTERN.test(hex) ? hex.toLowerCase() : null;
}

// conversion functions
export function hexToRgb(value) {
    const hex = normalizeHex(value) ?? '#000000';

    return {
        r: parseInt(hex.slice(1, 3), 16),
        g: parseInt(hex.slice(3, 5), 16),
        b: parseInt(hex.slice(5, 7), 16)
    };
}

export function rgbToHex({ r, g, b }) {
    const channel = value => clamp(Math.round(value), 0, 255).toString(16).padStart(2, '0');

    return `#${channel(r)}${channel(g)}${channel(b)}`;
}

export function rgbToHsv({ r, g, b }) {
    const red = r / 255;
    const green = g / 255;
    const blue = b / 255;

    const max = Math.max(red, green, blue);
    const min = Math.min(red, green, blue);
    const delta = max - min;

    let hue = 0;

    if (delta !== 0) {
        if (max === red) hue = ((green - blue) / delta) % 6;
        else if (max === green) hue = (blue - red) / delta + 2;
        else hue = (red - green) / delta + 4;
    }

    hue = hue * 60;
    if (hue < 0) hue += 360;

    return { h: hue, s: max === 0 ? 0 : delta / max, v: max };
}

export function hsvToRgb({ h, s, v }) {
    const hue = ((h % 360) + 360) % 360;
    const chroma = v * s;
    const second = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
    const match = v - chroma;

    let parts = [0, 0, 0];

    if (hue < 60) parts = [chroma, second, 0];
    else if (hue < 120) parts = [second, chroma, 0];
    else if (hue < 180) parts = [0, chroma, second];
    else if (hue < 240) parts = [0, second, chroma];
    else if (hue < 300) parts = [second, 0, chroma];
    else parts = [chroma, 0, second];

    return {
        r: Math.round((parts[0] + match) * 255),
        g: Math.round((parts[1] + match) * 255),
        b: Math.round((parts[2] + match) * 255)
    };
}

export function rgbToCmyk({ r, g, b }) {
    const red = r / 255;
    const green = g / 255;
    const blue = b / 255;

    const k = 1 - Math.max(red, green, blue);

    if (k === 1) return { c: 0, m: 0, y: 0, k: 100 };

    return {
        c: ((1 - red - k) / (1 - k)) * 100,
        m: ((1 - green - k) / (1 - k)) * 100,
        y: ((1 - blue - k) / (1 - k)) * 100,
        k: k * 100
    };
}

export function cmykToRgb({ c, m, y, k }) {
    const cyan = clamp(c, 0, 100) / 100;
    const magenta = clamp(m, 0, 100) / 100;
    const yellow = clamp(y, 0, 100) / 100;
    const black = clamp(k, 0, 100) / 100;

    return {
        r: Math.round(255 * (1 - cyan) * (1 - black)),
        g: Math.round(255 * (1 - magenta) * (1 - black)),
        b: Math.round(255 * (1 - yellow) * (1 - black))
    };
}

export function hexToHsv(value) {
    return rgbToHsv(hexToRgb(value));
}

export function hsvToHex(hsv) {
    return rgbToHex(hsvToRgb(hsv));
}

export function roundCmyk({ c, m, y, k }) {
    return {
        c: Math.round(c),
        m: Math.round(m),
        y: Math.round(y),
        k: Math.round(k)
    };
}

export function readableTextOn(value) {
    const { r, g, b } = hexToRgb(value);

    const linear = [r, g, b]
        .map(channel => channel / 255)
        .map(channel => (channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4));

    const luminance = 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];

    return luminance > 0.5 ? '#141414' : '#ffffff';
}