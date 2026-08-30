// component functions
export default function StatRows({ rows, emptyLabel = 'Nothing yet' }) {
    if (rows.length === 0) {
        return <p className="stat-empty">{emptyLabel}</p>;
    }

    const peak = Math.max(...rows.map(row => row.value), 1);

    return (
        <div className="stat-rows">
            {rows.map(row => (
                <div className="stat-row" key={row.key}>
                    <span className="stat-row-label" title={row.label}>{row.label}</span>

                    <span className="stat-row-track">
                        <span
                            className={`stat-row-fill ${row.tone ? `is-${row.tone}` : ''}`}
                            style={{
                                width: `${(row.value / peak) * 100}%`,
                                background: row.color ?? undefined
                            }}
                        />
                    </span>

                    <span className="stat-row-value">{row.display ?? row.value}</span>
                </div>
            ))}
        </div>
    );
}
