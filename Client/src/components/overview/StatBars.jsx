// configuration constants
const CHART_HEIGHT = 120;
const BAR_GAP = 4;

// component functions
export default function StatBars({ series, marker = null, emptyLabel = 'Nothing yet' }) {
    if (series.length === 0) {
        return <p className="stat-empty">{emptyLabel}</p>;
    }

    const peak = Math.max(...series.map(entry => entry.value), 1);
    const width = 100 / series.length;

    return (
        <div className="stat-bars">
            <div className="stat-bars-plot" style={{ height: CHART_HEIGHT }}>
                {series.map((entry, index) => (
                    <div
                        className="stat-bars-slot"
                        key={entry.key ?? index}
                        style={{ width: `calc(${width}% - ${BAR_GAP}px)` }}
                        title={`${entry.label}: ${entry.value}`}
                    >
                        <span
                            className={`stat-bar ${entry.tone ? `is-${entry.tone}` : ''}`}
                            style={{ height: `${(entry.value / peak) * 100}%` }}
                        />
                    </div>
                ))}
            </div>

            {marker && <p className="stat-bars-marker">{marker}</p>}

            <div className="stat-bars-axis">
                <span>{series[0].label}</span>
                <span>{series[series.length - 1].label}</span>
            </div>
        </div>
    );
}
