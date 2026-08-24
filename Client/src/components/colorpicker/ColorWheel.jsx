// component imports
import { useEffect, useRef } from 'react';
import { clamp } from '../../lib/color';

// configuration constants
const RING_THICKNESS = 0.16;
const HUE_STOPS = Array.from({ length: 13 }, (_, index) => `hsl(${index * 30}, 100%, 50%)`).join(', ');

// utility functions
function trianglePoints(radius) {
    return [0, 120, 240].map(offset => {
        const angle = ((offset - 90) * Math.PI) / 180;
        return { x: radius * Math.cos(angle), y: radius * Math.sin(angle) };
    });
}

function barycentric(point, [a, b, c]) {
    const denominator = (b.y - c.y) * (a.x - c.x) + (c.x - b.x) * (a.y - c.y);

    const wa = ((b.y - c.y) * (point.x - c.x) + (c.x - b.x) * (point.y - c.y)) / denominator;
    const wb = ((c.y - a.y) * (point.x - c.x) + (a.x - c.x) * (point.y - c.y)) / denominator;

    return [wa, wb, 1 - wa - wb];
}

function normalizeWeights(weights) {
    const clamped = weights.map(weight => Math.max(weight, 0));
    const total = clamped[0] + clamped[1] + clamped[2];

    if (total === 0) return [1, 0, 0];

    return clamped.map(weight => weight / total);
}

// component functions
export default function ColorWheel({ hsv, shape, size = 220, onChange }) {
    // dom references
    const rootRef = useRef(null);
    const modeRef = useRef(null);

    // derived variables
    const ringWidth = size * RING_THICKNESS;
    const innerSize = size - ringWidth * 2 - 10;
    const triangleRadius = innerSize / 2;
    const vertices = trianglePoints(triangleRadius);

    // calculation functions
    function pointFrom(event) {
        const rect = rootRef.current.getBoundingClientRect();

        return {
            x: event.clientX - rect.left - rect.width / 2,
            y: event.clientY - rect.top - rect.height / 2
        };
    }

    function applyHue(point) {
        let angle = (Math.atan2(point.y, point.x) * 180) / Math.PI + 90;
        if (angle < 0) angle += 360;

        onChange({ ...hsv, h: angle });
    }

    function applyTriangle(point) {
        const weights = normalizeWeights(barycentric(point, vertices));
        const [hue, white, black] = weights;

        const value = hue + white;
        const saturation = value === 0 ? 0 : hue / value;

        onChange({ h: hsv.h, s: clamp(saturation, 0, 1), v: clamp(value, 0, 1) });
    }

    function applyDisc(point) {
        const radius = innerSize / 2;
        const distance = Math.hypot(point.x, point.y);

        const scale = distance > radius ? radius / distance : 1;
        const x = point.x * scale;
        const y = point.y * scale;

        onChange({
            h: hsv.h,
            s: clamp((x + radius) / innerSize, 0, 1),
            v: clamp(1 - (y + radius) / innerSize, 0, 1)
        });
    }

    // event functions
    function startDrag(mode, event) {
        if (event.button !== 0) return;

        event.preventDefault();
        modeRef.current = mode;

        if (mode === 'hue') applyHue(pointFrom(event));
        else if (shape === 'triangle') applyTriangle(pointFrom(event));
        else applyDisc(pointFrom(event));
    }

    // lifecycle functions
    useEffect(() => {
        function handleMove(event) {
            if (!modeRef.current) return;

            const point = pointFrom(event);

            if (modeRef.current === 'hue') applyHue(point);
            else if (shape === 'triangle') applyTriangle(point);
            else applyDisc(point);
        }

        function handleUp() {
            modeRef.current = null;
        }

        window.addEventListener('mousemove', handleMove);
        window.addEventListener('mouseup', handleUp);

        return () => {
            window.removeEventListener('mousemove', handleMove);
            window.removeEventListener('mouseup', handleUp);
        };
    });

    // derived variables
    const hueAngle = ((hsv.h - 90) * Math.PI) / 180;
    const hueRadius = size / 2 - ringWidth / 2;

    const huePoint = {
        x: hueRadius * Math.cos(hueAngle),
        y: hueRadius * Math.sin(hueAngle)
    };

    let handle = { x: 0, y: 0 };

    if (shape === 'triangle') {
        const weights = [hsv.s * hsv.v, (1 - hsv.s) * hsv.v, 1 - hsv.v];

        handle = {
            x: vertices[0].x * weights[0] + vertices[1].x * weights[1] + vertices[2].x * weights[2],
            y: vertices[0].y * weights[0] + vertices[1].y * weights[1] + vertices[2].y * weights[2]
        };
    } else {
        handle = {
            x: hsv.s * innerSize - innerSize / 2,
            y: (1 - hsv.v) * innerSize - innerSize / 2
        };
    }

    const pureHue = `hsl(${hsv.h}, 100%, 50%)`;

    return (
        <div className="color-wheel" ref={rootRef} style={{ width: size, height: size }}>
            <div
                className="color-wheel-ring"
                style={{
                    background: `conic-gradient(from 0deg, ${HUE_STOPS})`,
                    '--ring-inner': `${((size / 2 - ringWidth) / (size / 2)) * 100}%`
                }}
                onMouseDown={event => startDrag('hue', event)}
            />

            <span
                className="color-wheel-handle"
                style={{ transform: `translate(calc(${huePoint.x}px - 50%), calc(${huePoint.y}px - 50%))`, background: pureHue }}
            />

            {shape === 'triangle' ? (
                <svg
                    className="color-wheel-area"
                    width={innerSize}
                    height={innerSize}
                    viewBox={`${-triangleRadius} ${-triangleRadius} ${innerSize} ${innerSize}`}
                    onMouseDown={event => startDrag('area', event)}
                >
                    <defs>
                        <linearGradient
                            id="wheel-saturation"
                            gradientUnits="userSpaceOnUse"
                            x1={vertices[1].x} y1={vertices[1].y}
                            x2={vertices[0].x} y2={vertices[0].y}
                        >
                            <stop offset="0%" stopColor="#ffffff" />
                            <stop offset="100%" stopColor={pureHue} />
                        </linearGradient>

                        <linearGradient
                            id="wheel-value"
                            gradientUnits="userSpaceOnUse"
                            x1={vertices[2].x} y1={vertices[2].y}
                            x2={(vertices[0].x + vertices[1].x) / 2} y2={(vertices[0].y + vertices[1].y) / 2}
                        >
                            <stop offset="0%" stopColor="#000000" stopOpacity="1" />
                            <stop offset="100%" stopColor="#000000" stopOpacity="0" />
                        </linearGradient>
                    </defs>

                    <polygon
                        points={vertices.map(point => `${point.x},${point.y}`).join(' ')}
                        fill="url(#wheel-saturation)"
                    />
                    <polygon
                        points={vertices.map(point => `${point.x},${point.y}`).join(' ')}
                        fill="url(#wheel-value)"
                    />
                </svg>
            ) : (
                <div
                    className="color-wheel-area color-wheel-area--disc"
                    style={{
                        width: innerSize,
                        height: innerSize,
                        background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, transparent), ${pureHue}`
                    }}
                    onMouseDown={event => startDrag('area', event)}
                />
            )}

            <span
                className="color-wheel-handle color-wheel-handle--area"
                style={{ transform: `translate(calc(${handle.x}px - 50%), calc(${handle.y}px - 50%))` }}
            />
        </div>
    );
}