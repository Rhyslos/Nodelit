// component imports
import { useMemo } from 'react';
import { clamp, hsvToHex, rgbToCmyk, cmykToRgb, rgbToHex, roundCmyk } from '../../lib/color';

// configuration constants
const GRID_RADIUS = 5;
const CELL_RADIUS = 12;
const CMYK_CHANNELS = [
    { key: 'c', label: 'C', track: '#00ffff' },
    { key: 'm', label: 'M', track: '#ff00ff' },
    { key: 'y', label: 'Y', track: '#ffff00' },
    { key: 'k', label: 'K', track: '#000000' }
];

// utility functions
function hexCells(radius) {
    const cells = [];

    for (let q = -radius; q <= radius; q++) {
        const from = Math.max(-radius, -q - radius);
        const to = Math.min(radius, -q + radius);

        for (let r = from; r <= to; r++) {
            const x = Math.sqrt(3) * (q + r / 2);
            const y = 1.5 * r;
            const distance = Math.hypot(x, y);

            let hue = (Math.atan2(y, x) * 180) / Math.PI + 90;
            if (hue < 0) hue += 360;

            cells.push({ key: `${q}:${r}`, x, y, hue, distance });
        }
    }

    const furthest = Math.max(...cells.map(cell => cell.distance));

    return cells.map(cell => ({ ...cell, saturation: cell.distance / furthest }));
}

function cellPoints(cx, cy, radius) {
    return Array.from({ length: 6 }, (_, index) => {
        const angle = (Math.PI / 180) * (60 * index - 30);
        return `${cx + radius * Math.cos(angle)},${cy + radius * Math.sin(angle)}`;
    }).join(' ');
}

// component functions
export default function ColorHexGrid({ hsv, rgb, onChange, onChangeRgb }) {
    // derived variables
    const cells = useMemo(() => hexCells(GRID_RADIUS), []);
    const cmyk = roundCmyk(rgbToCmyk(rgb));

    const extent = (GRID_RADIUS + 1) * Math.sqrt(3) * CELL_RADIUS;
    const spacing = CELL_RADIUS * 1.02;

    // event handlers
    function handleCell(cell) {
        onChange({ h: cell.hue, s: cell.saturation, v: hsv.v });
    }

    function handleCmyk(key, value) {
        const next = { ...cmyk, [key]: clamp(Number(value) || 0, 0, 100) };
        onChangeRgb(cmykToRgb(next));
    }

    return (
        <div className="color-grid">
            <div className="color-grid-top">
                <svg
                    className="color-grid-cells"
                    viewBox={`${-extent} ${-extent} ${extent * 2} ${extent * 2}`}
                >
                    {cells.map(cell => {
                        const fill = hsvToHex({ h: cell.hue, s: cell.saturation, v: hsv.v });
                        const selected = Math.abs(cell.saturation - hsv.s) < 0.08
                            && (cell.saturation < 0.08 || Math.abs(cell.hue - hsv.h) < 14);

                        return (
                            <polygon
                                key={cell.key}
                                className={`color-grid-cell ${selected ? 'is-selected' : ''}`}
                                points={cellPoints(cell.x * spacing, cell.y * spacing, CELL_RADIUS)}
                                fill={fill}
                                onMouseDown={() => handleCell(cell)}
                            />
                        );
                    })}
                </svg>

                <div className="color-grid-value">
                    <input
                        type="range"
                        className="color-grid-value-input"
                        min={0}
                        max={100}
                        value={Math.round(hsv.v * 100)}
                        onChange={event => onChange({ ...hsv, v: Number(event.target.value) / 100 })}
                        aria-label="Brightness"
                    />
                </div>
            </div>

            <div className="color-grid-channels">
                {CMYK_CHANNELS.map(channel => (
                    <label className="color-channel" key={channel.key}>
                        <span className="color-channel-label">{channel.label}</span>

                        <input
                            type="range"
                            className="color-channel-slider"
                            style={{ '--track': channel.track }}
                            min={0}
                            max={100}
                            value={cmyk[channel.key]}
                            onChange={event => handleCmyk(channel.key, event.target.value)}
                        />

                        <input
                            type="number"
                            className="color-channel-value"
                            min={0}
                            max={100}
                            value={cmyk[channel.key]}
                            onChange={event => handleCmyk(channel.key, event.target.value)}
                        />
                    </label>
                ))}
            </div>

            <span className="color-grid-note">{rgbToHex(rgb).toUpperCase()}</span>
        </div>
    );
}
