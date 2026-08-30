// page imports
import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useKanban } from '../contexts/KanbanContext';
import { useWorkspacePresence } from '../hooks/useWorkspacePresence';
import { useWorkspaceStats } from '../hooks/useWorkspaceStats';
import StatCard from '../components/overview/StatCard';
import StatBars from '../components/overview/StatBars';
import StatRows from '../components/overview/StatRows';
import StatLines from '../components/overview/StatLines';

// configuration constants
const HISTORY_WINDOW = 12;
const CYCLE_LABELS = ['0-5d', '5-10d', '10-15d', '15-20d', '20-25d', '25-30d', '30d+'];
const AGING_LABELS = ['0-15d', '15-30d', '30-45d', '45-60d', '60d+'];

// formatting functions
function whenLabel(days) {
    if (days < 0) return `${Math.abs(days)}d late`;
    if (days === 0) return 'Today';
    if (days === 1) return 'Tomorrow';

    return `in ${days}d`;
}

function whenTone(days) {
    if (days < 0) return 'overdue';
    if (days <= 1) return 'today';

    return 'soon';
}

function shortDate(value) {
    const [year, month, day] = String(value).split('-').map(Number);
    if (!year) return value;

    return new Date(year, month - 1, day)
        .toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

function bucketSeries(buckets, labels, tone) {
    return labels.map((label, index) => {
        const match = buckets.find(entry => entry.bucket === index + 1);
        return { key: label, label, value: match?.total ?? 0, tone };
    });
}

function weeklySeries(rows, weeks) {
    const byWeek = new Map(rows.map(row => [row.week, row.total]));
    return weeks.map(week => byWeek.get(week) ?? 0);
}

// component functions
export default function Overview() {
    // hook integrations
    const { workspaceID } = useParams();
    const { boardData } = useKanban();
    const { members } = useWorkspacePresence(workspaceID);
    const { stats, loading } = useWorkspaceStats(workspaceID);

    // state variables
    const [offset, setOffset] = useState(0);

    // derived variables
    const weeks = useMemo(() => {
        const all = new Set([
            ...(stats?.throughput ?? []).map(entry => entry.week),
            ...(stats?.created ?? []).map(entry => entry.week)
        ]);

        return [...all].sort();
    }, [stats]);

    const visibleWeeks = useMemo(() => {
        if (weeks.length === 0) return [];

        const end = Math.max(HISTORY_WINDOW, weeks.length - offset);
        return weeks.slice(Math.max(0, end - HISTORY_WINDOW), end);
    }, [weeks, offset]);

    const memberName = id =>
        members.find(member => member.id === id)?.displayName ?? 'Unknown';

    const tagOf = id => boardData.tags.find(tag => tag.id === id) ?? null;

    // render conditions
    if (loading) {
        return <div className="overview-root"><p className="stat-empty">Loading overview…</p></div>;
    }

    if (!stats) {
        return <div className="overview-root"><p className="stat-empty">No data yet.</p></div>;
    }

    // statistics calculations
    const headline = stats.headline ?? {};
    const reliability = stats.reliability ?? { on_time: 0, late: 0 };
    const rated = reliability.on_time + reliability.late;

    const completedPerWeek = weeklySeries(stats.throughput ?? [], visibleWeeks);
    const createdPerWeek = weeklySeries(stats.created ?? [], visibleWeeks);

    const recent = completedPerWeek.slice(-4);
    const rate = recent.length > 0 ? recent.reduce((sum, n) => sum + n, 0) / recent.length : 0;
    const remaining = (headline.total ?? 0) - (headline.completed ?? 0);
    const weeksLeft = rate > 0 ? Math.ceil(remaining / rate) : null;

    return (
        <div className="overview-root">
            
            {/* section wrapper */}
            <div className="overview-section">
                <h2 className="overview-section-title">Current Status & Workload</h2>
                <div className="overview-grid">
                    
                    {/* stat cards */}
                    <StatCard title="Right now" hint={`${remaining} open of ${headline.total ?? 0}`}>
                        <div className="stat-chips">
                            <span className="stat-chip is-overdue">
                                <strong>{headline.overdue ?? 0}</strong>overdue
                            </span>
                            <span className="stat-chip is-today">
                                <strong>{headline.due_today ?? 0}</strong>due today
                            </span>
                            <span className="stat-chip is-soon">
                                <strong>{headline.due_week ?? 0}</strong>this week
                            </span>
                            <span className="stat-chip">
                                <strong>{headline.undated ?? 0}</strong>no date
                            </span>
                            <span className="stat-chip">
                                <strong>{stats.unassigned ?? 0}</strong>no owner
                            </span>
                        </div>
                    </StatCard>

                    <StatCard title="Who is carrying what" hint="open tasks">
                        <StatRows
                            emptyLabel="Nothing assigned"
                            rows={(stats.workload ?? []).map(entry => ({
                                key: entry.userID,
                                label: memberName(entry.userID),
                                value: entry.total,
                                tone: entry.overdue > 0 ? 'overdue' : 'soon',
                                display: entry.overdue > 0 ? `${entry.total} · ${entry.overdue} late` : entry.total
                            }))}
                        />
                    </StatCard>
                    
                    <StatCard title="What kind of work" hint="open tasks by tag">
                        <StatRows
                            emptyLabel="No tagged work"
                            rows={(stats.tagMix ?? []).map(entry => {
                                const tag = tagOf(entry.tagID);

                                return {
                                    key: entry.tagID,
                                    label: tag?.name || 'Unnamed',
                                    value: entry.total,
                                    color: tag?.color
                                };
                            })}
                        />
                    </StatCard>
                </div>
            </div>

            {/* section wrapper */}
            <div className="overview-section">
                <h2 className="overview-section-title">Deadlines & Future</h2>
                <div className="overview-grid">
                    
                    {/* stat cards */}
                    <StatCard title="Due next" hint="open work, soonest first">
                        {(stats.upcoming ?? []).length === 0 ? (
                            <p className="stat-empty">Nothing due in the next week.</p>
                        ) : (
                            <ul className="stat-list">
                                {stats.upcoming.map(task => (
                                    <li className="stat-list-row" key={task.id}>
                                        <span className={`stat-list-when is-${whenTone(task.daysRemaining)}`}>
                                            {whenLabel(task.daysRemaining)}
                                        </span>

                                        <span className="stat-list-title" title={task.title}>
                                            {task.title || 'Untitled task'}
                                        </span>

                                        <span
                                            className="stat-list-where"
                                            style={{ '--tab-color': task.tabColor }}
                                            title={task.tabName}
                                        >
                                            {task.tabName}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </StatCard>

                    <StatCard title="Deadlines ahead" hint="past week and next two">
                        <StatBars
                            emptyLabel="No dated work"
                            series={(stats.timeline ?? []).map(entry => ({
                                key: entry.day,
                                label: shortDate(entry.day),
                                value: entry.total,
                                tone: entry.day < new Date().toISOString().slice(0, 10) ? 'overdue' : 'soon'
                            }))}
                        />
                    </StatCard>

                    <StatCard title="Forecast" hint="at the recent rate">
                        {weeksLeft === null ? (
                            <p className="stat-empty">Not enough completed work to project.</p>
                        ) : (
                            <div className="stat-forecast">
                                <strong>{weeksLeft}</strong>
                                <span>{weeksLeft === 1 ? 'week' : 'weeks'} to clear {remaining} open tasks</span>
                                <span className="stat-forecast-rate">{rate.toFixed(1)} finished per week recently</span>
                            </div>
                        )}
                    </StatCard>
                </div>
            </div>

            {/* section wrapper */}
            <div className="overview-section">
                <h2 className="overview-section-title">Performance & History</h2>
                <div className="overview-grid">
                    
                    {/* stat cards */}
                    <StatCard title="History" hint="created against completed" wide>
                        <StatLines
                            labels={visibleWeeks.map(shortDate)}
                            lines={[
                                { key: 'created', label: 'Created', tone: 'created', values: createdPerWeek },
                                { key: 'completed', label: 'Completed', tone: 'completed', values: completedPerWeek }
                            ]}
                        />

                        <div className="overview-scrub">
                            <button
                                type="button"
                                disabled={offset + HISTORY_WINDOW >= weeks.length}
                                onClick={() => setOffset(current => current + 4)}
                            >
                                ‹ Earlier
                            </button>

                            <span>{visibleWeeks.length > 0 ? `${shortDate(visibleWeeks[0])} – ${shortDate(visibleWeeks[visibleWeeks.length - 1])}` : ''}</span>

                            <button
                                type="button"
                                disabled={offset === 0}
                                onClick={() => setOffset(current => Math.max(0, current - 4))}
                            >
                                Later ›
                            </button>
                        </div>
                    </StatCard>

                    <StatCard title="Throughput" hint="completed per week">
                        <StatBars
                            emptyLabel="Nothing completed yet"
                            series={visibleWeeks.map((week, index) => ({
                                key: week,
                                label: shortDate(week),
                                value: completedPerWeek[index],
                                tone: 'completed'
                            }))}
                        />
                    </StatCard>

                    <StatCard
                        title="Cycle time"
                        hint={stats.cycleMedian ? `median ${Number(stats.cycleMedian).toFixed(1)} days` : 'not enough history'}
                    >
                        <StatBars series={bucketSeries(stats.cycle ?? [], CYCLE_LABELS, 'completed')} />
                    </StatCard>

                    <StatCard title="How long tasks have sat" hint="open work by age">
                        <StatBars series={bucketSeries(stats.aging ?? [], AGING_LABELS, 'soon')} />
                    </StatCard>

                    <StatCard title="Deadline reliability" hint={rated > 0 ? `${rated} dated tasks` : 'no history yet'}>
                        {rated === 0 ? (
                            <p className="stat-empty">No completed tasks had deadlines.</p>
                        ) : (
                            <div className="stat-split">
                                <span
                                    className="stat-split-part is-completed"
                                    style={{ width: `${(reliability.on_time / rated) * 100}%` }}
                                >
                                    {reliability.on_time} on time
                                </span>
                                <span
                                    className="stat-split-part is-overdue"
                                    style={{ width: `${(reliability.late / rated) * 100}%` }}
                                >
                                    {reliability.late} late
                                </span>
                            </div>
                        )}
                    </StatCard>
                </div>
            </div>
        </div>
    );
}