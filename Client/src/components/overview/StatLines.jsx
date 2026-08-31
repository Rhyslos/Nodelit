// package imports
import { useId, useMemo, useState } from 'react';
import { buildScale, labelStride, showsLabel, toneVariable } from './chartScale';

// configuration constants
const GRID_STEPS = 4;
const MAX_LABELS = 12;
const MAX_STATIC_DOTS = 16;

// component functions
export default function StatLines({ labels, lines, emptyLabel = 'No history yet' }) {
    // state variables
    const [active, setActive] = useState(null);
    const gradientID = useId().replace(/[^a-zA-Z0-9-_]/g, '');

    // data transformations
    const { max, ticks, points } = useMemo(() => {
        const safeLabels = labels ?? [];
        const safeLines = lines ?? [];

        const peak = Math.max(...safeLines.flatMap(line => line.values ?? []), 0);
        const scale = buildScale(peak, GRID_STEPS);

        const mapped = safeLabels.map((label, index) => ({
            label,
            x: ((index + 0.5) / safeLabels.length) * 100,
            values: safeLines.map(line => line.values?.[index] ?? 0)
        }));

        return { ...scale, points: mapped };
    }, [labels, lines]);

    // render conditions
    if (!labels || labels.length === 0 || !lines || lines.length === 0) {
        return <p className="stat-empty">{emptyLabel}</p>;
    }

    // calculation functions
    const heightOf = value => 100 - (value / max) * 100;

    const pathFor = lineIndex => {
        if (points.length === 0) return '';
        if (points.length === 1) {
            const only = points[0];
            return `M 0 ${heightOf(only.values[lineIndex])} L 100 ${heightOf(only.values[lineIndex])}`;
        }

        let path = `M ${points[0].x} ${heightOf(points[0].values[lineIndex])}`;

        for (let index = 0; index < points.length - 1; index += 1) {
            const from = points[index];
            const to = points[index + 1];
            const control = (from.x + to.x) / 2;

            path += ` C ${control} ${heightOf(from.values[lineIndex])},`
                + ` ${control} ${heightOf(to.values[lineIndex])},`
                + ` ${to.x} ${heightOf(to.values[lineIndex])}`;
        }

        return path;
    };

    const stride = labelStride(points.length, MAX_LABELS);
    const showDots = points.length <= MAX_STATIC_DOTS;

    // layout structure
    return (
        <div className="stat-lines">
            <div className="stat-lines-scale" aria-hidden="true">
                {ticks.map(tick => <span key={tick}>{tick}</span>)}
            </div>

            <div className="stat-lines-plot">
                <div className="stat-lines-grid" aria-hidden="true">
                    {ticks.map(tick => <span key={tick} />)}
                </div>

                <svg
                    className="stat-lines-svg"
                    viewBox="0 0 100 100"
                    preserveAspectRatio="none"
                    aria-hidden="true"
                >
                    <defs>
                        {lines.map(line => (
                            <linearGradient
                                key={line.key}
                                id={`${gradientID}-${line.key}`}
                                x1="0" y1="0" x2="0" y2="1"
                                style={{ '--tone': toneVariable(line.tone ?? line.key) }}
                            >
                                <stop offset="0%" stopColor="var(--tone)" stopOpacity="0.32" />
                                <stop offset="100%" stopColor="var(--tone)" stopOpacity="0" />
                            </linearGradient>
                        ))}
                    </defs>

                    {lines.map((line, lineIndex) => {
                        const stroke = pathFor(lineIndex);
                        const first = points[0];
                        const last = points[points.length - 1];
                        const area = `${stroke} L ${last.x} 100 L ${first.x} 100 Z`;

                        return (
                            <g key={line.key} style={{ '--tone': toneVariable(line.tone ?? line.key) }}>
                                <path d={area} fill={`url(#${gradientID}-${line.key})`} />
                                <path
                                    className="stat-lines-stroke"
                                    d={stroke}
                                    fill="none"
                                    stroke="var(--tone)"
                                    vectorEffect="non-scaling-stroke"
                                />
                            </g>
                        );
                    })}
                </svg>

                <div className="stat-lines-markers" aria-hidden="true">
                    {points.map((point, index) => lines.map((line, lineIndex) => (
                        <span
                            className="stat-lines-dot"
                            key={`${line.key}-${point.label}`}
                            data-active={active === index || undefined}
                            hidden={!showDots && active !== index}
                            style={{
                                '--tone': toneVariable(line.tone ?? line.key),
                                left: `${point.x}%`,
                                top: `${heightOf(point.values[lineIndex])}%`
                            }}
                        />
                    )))}
                </div>

                <div className="stat-lines-hits">
                    {points.map((point, index) => (
                        <div
                            className="stat-lines-hit"
                            key={point.label}
                            tabIndex={0}
                            aria-label={`${point.label}: ${lines.map((line, i) => `${line.label} ${point.values[i]}`).join(', ')}`}
                            data-active={active === index || undefined}
                            data-align={index === 0 ? 'start' : index === points.length - 1 ? 'end' : undefined}
                            onMouseEnter={() => setActive(index)}
                            onMouseLeave={() => setActive(current => (current === index ? null : current))}
                            onFocus={() => setActive(index)}
                            onBlur={() => setActive(current => (current === index ? null : current))}
                        >
                            {active === index && (
                                <>
                                    <span className="stat-lines-guide" />

                                    <div className="stat-lines-tip" role="tooltip">
                                        <span className="stat-lines-tip-label">{point.label}</span>

                                        {lines.map((line, lineIndex) => (
                                            <span
                                                className="stat-lines-tip-row"
                                                key={line.key}
                                                style={{ '--tone': toneVariable(line.tone ?? line.key) }}
                                            >
                                                <span className="stat-lines-swatch" />
                                                <span className="stat-lines-tip-name">{line.label}</span>
                                                <strong>{point.values[lineIndex]}</strong>
                                            </span>
                                        ))}
                                    </div>
                                </>
                            )}
                        </div>
                    ))}
                </div>
            </div>

            <div className="stat-lines-axis" aria-hidden="true">
                {points.map((point, index) => (
                    <span key={point.label} data-active={active === index || undefined}>
                        {showsLabel(index, points.length, stride) ? point.label : ''}
                    </span>
                ))}
            </div>

            <div className="stat-lines-legend">
                {lines.map(line => (
                    <span
                        className="stat-lines-key"
                        key={line.key}
                        style={{ '--tone': toneVariable(line.tone ?? line.key) }}
                    >
                        <span className="stat-lines-swatch" />
                        {line.label}
                    </span>
                ))}
            </div>
        </div>
    );
}
