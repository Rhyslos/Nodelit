// component functions
export default function StatCard({ title, hint, wide = false, children }) {
    return (
        <section className={`stat-card ${wide ? 'stat-card--wide' : ''}`}>
            <header className="stat-card-head">
                <h2 className="stat-card-title">{title}</h2>
                {hint && <span className="stat-card-hint">{hint}</span>}
            </header>

            <div className="stat-card-body">{children}</div>
        </section>
    );
}
