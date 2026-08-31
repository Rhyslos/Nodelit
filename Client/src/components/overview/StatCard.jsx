// component functions
export default function StatCard({ title, hint, wide = false, full = false, action, children }) {
    const classes = [
        'stat-card',
        wide ? 'stat-card--wide' : '',
        full ? 'stat-card--full' : ''
    ].filter(Boolean).join(' ');

    return (
        <section className={classes}>
            <header className="stat-card-head">
                <h3 className="stat-card-title">{title}</h3>

                <span className="stat-card-tools">
                    {hint && <span className="stat-card-hint">{hint}</span>}
                    {action}
                </span>
            </header>

            <div className="stat-card-body">{children}</div>
        </section>
    );
}
