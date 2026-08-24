// component imports
import { useState, useEffect, useRef } from 'react';
import { CircleDot, Triangle } from 'lucide-react';
import ColorWheel from './ColorWheel';
import ColorHexGrid from './ColorHexGrid';
import {
    clamp,
    normalizeHex,
    hexToRgb,
    rgbToHex,
    rgbToHsv,
    hsvToHex,
    readableTextOn
} from '../../lib/color';

// configuration constants
const SHAPE_STORAGE_KEY = 'nodelit:pickershape';
const MODE_STORAGE_KEY = 'nodelit:pickermode';
const RGB_CHANNELS = [
    { key: 'r', label: 'R' },
    { key: 'g', label: 'G' },
    { key: 'b', label: 'B' }
];

// utility functions
function readPreference(key, allowed, fallback) {
    try {
        const stored = localStorage.getItem(key);
        return allowed.includes(stored) ? stored : fallback;
    } catch {
        return fallback;
    }
}

function persistPreference(key, value) {
    try {
        localStorage.setItem(key, value);
    } catch {
        return;
    }
}

// component functions
export default function ColorPicker({ value, presets = [], onChange, onCommit }) {
    // state variables
    const [mode, setMode] = useState(() => readPreference(MODE_STORAGE_KEY, ['wheel', 'grid'], 'wheel'));
    const [shape, setShape] = useState(() => readPreference(SHAPE_STORAGE_KEY, ['circle', 'triangle'], 'circle'));
    const [hsv, setHsv] = useState(() => rgbToHsv(hexToRgb(value)));
    const [hexDraft, setHexDraft] = useState(() => normalizeHex(value) ?? '#000000');

    // sync references
    const lastEmitted = useRef(normalizeHex(value) ?? '#000000');

    // lifecycle functions
    useEffect(() => {
        const incoming = normalizeHex(value);
        if (!incoming || incoming === lastEmitted.current) return;

        lastEmitted.current = incoming;
        setHsv(rgbToHsv(hexToRgb(incoming)));
        setHexDraft(incoming);
    }, [value]);

    // mutation functions
    function emit(nextHsv) {
        const hex = hsvToHex(nextHsv);

        lastEmitted.current = hex;
        setHsv(nextHsv);
        setHexDraft(hex);
        onChange?.(hex);
    }

    function emitRgb(rgb) {
        emit(rgbToHsv(rgb));
    }

    function handleHexInput(next) {
        setHexDraft(next);

        const parsed = normalizeHex(next);
        if (parsed) emit(rgbToHsv(hexToRgb(parsed)));
    }

    function commitHexDraft() {
        const parsed = normalizeHex(hexDraft);
        setHexDraft(parsed ?? hsvToHex(hsv));
    }

    function handleRgbChannel(key, raw) {
        const rgb = { ...hexToRgb(hsvToHex(hsv)), [key]: clamp(Number(raw) || 0, 0, 255) };
        emitRgb(rgb);
    }

    function handleMode(next) {
        setMode(next);
        persistPreference(MODE_STORAGE_KEY, next);
    }

    function handleShape(next) {
        setShape(next);
        persistPreference(SHAPE_STORAGE_KEY, next);
    }

    // derived variables
    const hex = hsvToHex(hsv);
    const rgb = hexToRgb(hex);

    return (
        <div className="color-picker">
            <div className="color-picker-head">
                <div className="color-picker-modes">
                    <button
                        type="button"
                        className={`color-picker-mode ${mode === 'wheel' ? 'active' : ''}`}
                        onClick={() => handleMode('wheel')}
                    >
                        Wheel
                    </button>

                    <button
                        type="button"
                        className={`color-picker-mode ${mode === 'grid' ? 'active' : ''}`}
                        onClick={() => handleMode('grid')}
                    >
                        Detailed
                    </button>
                </div>

                {mode === 'wheel' && (
                    <div className="color-picker-shapes">
                        <button
                            type="button"
                            className={`color-picker-shape ${shape === 'circle' ? 'active' : ''}`}
                            title="Circle centre"
                            aria-label="Circle centre"
                            onClick={() => handleShape('circle')}
                        >
                            <CircleDot size={13} strokeWidth={2} />
                        </button>

                        <button
                            type="button"
                            className={`color-picker-shape ${shape === 'triangle' ? 'active' : ''}`}
                            title="Triangle centre"
                            aria-label="Triangle centre"
                            onClick={() => handleShape('triangle')}
                        >
                            <Triangle size={13} strokeWidth={2} />
                        </button>
                    </div>
                )}
            </div>

            <div className="color-picker-body">
                {mode === 'wheel' ? (
                    <ColorWheel hsv={hsv} shape={shape} onChange={emit} />
                ) : (
                    <ColorHexGrid hsv={hsv} rgb={rgb} onChange={emit} onChangeRgb={emitRgb} />
                )}
            </div>

            {presets.length > 0 && (
                <div className="color-picker-presets">
                    {presets.map(preset => (
                        <button
                            key={preset}
                            type="button"
                            className={`color-picker-preset ${preset.toLowerCase() === hex ? 'selected' : ''}`}
                            style={{ background: preset }}
                            title={preset}
                            onClick={() => handleHexInput(preset)}
                        />
                    ))}
                </div>
            )}

            <div className="color-picker-readout">
                <span
                    className="color-picker-preview"
                    style={{ background: hex, color: readableTextOn(hex) }}
                >
                    Aa
                </span>

                <label className="color-field color-field--hex">
                    <span className="color-field-label">Hex</span>
                    <input
                        className="color-field-input"
                        value={hexDraft}
                        maxLength={7}
                        spellCheck={false}
                        onChange={event => handleHexInput(event.target.value)}
                        onBlur={commitHexDraft}
                        onKeyDown={event => { if (event.key === 'Enter') commitHexDraft(); }}
                    />
                </label>

                {RGB_CHANNELS.map(channel => (
                    <label className="color-field" key={channel.key}>
                        <span className="color-field-label">{channel.label}</span>
                        <input
                            type="number"
                            className="color-field-input"
                            min={0}
                            max={255}
                            value={rgb[channel.key]}
                            onChange={event => handleRgbChannel(channel.key, event.target.value)}
                        />
                    </label>
                ))}
            </div>

            {onCommit && (
                <div className="color-picker-actions">
                    <button type="button" className="color-picker-apply" onClick={() => onCommit(hex)}>
                        Use colour
                    </button>
                </div>
            )}
        </div>
    );
}
