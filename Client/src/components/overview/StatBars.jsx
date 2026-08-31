// package imports
import { useMemo, useState } from 'react';
import { buildScale, labelStride, showsLabel, toneVariable } from './chartScale';

// configuration constants
const GRID_STEPS = 4;
const MAX_LABELS = 14;

// component functions
export default function StatBars({ series, emptyLabel = 'Nothing to show' }) {
    // state variables
    const [active, setActive] = useState(null);

    // data transformations
    const { max, ticks } = useMemo(
        () => buildScale(Math.max(...(series ?? []).map(entry => entry.value), 0), GRID_STEPS),
        [series]
    );

    // render conditions
    if (!series || series.length === 0) {
        return <p className="stat-empty">{emptyLabel}</p>;
    }

    const stride = labelStride(series.length, MAX_LABELS);

    // layout structure
    return (
        <div className="stat-bars">
            <div className="stat-bars-scale" aria-hidden="true">
                {ticks.map(tick => <span key={tick}>{tick}</span>)}
            </div>

            <div className="stat-bars-plot">
                <div className="stat-bars-grid" aria-hidden="true">
                    {ticks.map(tick => <span key={tick} />)}
                </div>

                {series.map((entry, index) => {
                    const filled = entry.value > 0 ? Math.max((entry.value / max) * 100, 2) : 0;
                    const isActive = active === index;

                    return (
                        <div
                            className="stat-bars-column"
                            key={entry.key}
                            tabIndex={0}
                            aria-label={`${entry.label}: ${entry.value}`}
                            data-active={isActive || undefined}
                            data-align={index === 0 ? 'start' : index === series.length - 1 ? 'end' : undefined}
                            style={{ '--tone': toneVariable(entry.tone), '--fill': `${filled}%` }}
                            onMouseEnter={() => setActive(index)}
                            onMouseLeave={() => setActive(current => (current === index ? null : current))}
                            onFocus={() => setActive(index)}
                            onBlur={() => setActive(current => (current === index ? null : current))}
                        >
                            {isActive && (
                                <div className="stat-bars-tip" role="tooltip">
                                    <span className="stat-bars-tip-value">{entry.value}</span>
                                    <span className="stat-bars-tip-label">{entry.label}</span>
                                </div>
                            )}

                            <div className="stat-bars-track">
                                <div className="stat-bars-bar" />
                            </div>
                        </div>
                    );
                })}
            </div>

            <div className="stat-bars-axis" aria-hidden="true">
                {series.map((entry, index) => (
                    <span key={entry.key} data-active={active === index || undefined}>
                        {showsLabel(index, series.length, stride) ? entry.label : ''}
                    </span>
                ))}
            </div>
        </div>
    );
}
