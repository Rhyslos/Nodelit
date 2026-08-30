// component imports
import { useMemo } from 'react';

// configuration constants
const VIEW_WIDTH = 640;
const VIEW_HEIGHT = 160;
const PADDING = 8;

// utility functions
function pathFor(values, peak, count) {
    if (values.length === 0) return '';

    const step = count > 1 ? (VIEW_WIDTH - PADDING * 2) / (count - 1) : 0;
    const usable = VIEW_HEIGHT - PADDING * 2;

    return values
        .map((value, index) => {
            const x = PADDING + index * step;
            const y = PADDING + usable - (value / peak) * usable;
            return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
        })
        .join(' ');
}

// component functions
export default function StatLines({ lines, labels, projection = null, emptyLabel = 'Nothing yet' }) {
    const peak = useMemo(
        () => Math.max(1, ...lines.flatMap(line => line.values), ...(projection?.values ?? [])),
        [lines, projection]
    );

    if (labels.length === 0) {
        return <p className="stat-empty">{emptyLabel}</p>;
    }

    const count = Math.max(labels.length, projection ? projection.values.length : 0);

    return (
        <div className="stat-lines">
            <svg viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`} preserveAspectRatio="none" role="img">
                {lines.map(line => (
                    <path
                        key={line.key}
                        className={`stat-line is-${line.tone}`}
                        d={pathFor(line.values, peak, count)}
                        fill="none"
                    />
                ))}

                {projection && (
                    <path
                        className="stat-line is-projection"
                        d={pathFor(projection.values, peak, count)}
                        fill="none"
                    />
                )}
            </svg>

            <div className="stat-lines-legend">
                {lines.map(line => (
                    <span className="stat-lines-key" key={line.key}>
                        <span className={`stat-lines-swatch is-${line.tone}`} />
                        {line.label}
                    </span>
                ))}
            </div>

            <div className="stat-bars-axis">
                <span>{labels[0]}</span>
                <span>{labels[labels.length - 1]}</span>
            </div>
        </div>
    );
}
