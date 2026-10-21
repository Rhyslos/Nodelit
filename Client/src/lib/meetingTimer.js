// configuration constants
const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

// utility functions
function formatSpan(ms) {
    const totalMinutes = Math.max(1, Math.ceil(ms / MINUTE_MS));

    if (totalMinutes < 60) return `${totalMinutes}m`;

    const days = Math.floor(totalMinutes / (24 * 60));
    const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
    const minutes = totalMinutes % 60;

    if (days > 0) return hours > 0 ? `${days}d ${hours}h` : `${days}d`;

    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
}

// returns { label, tone } where tone is one of: live, soon, today, later, ended
export function meetingCountdown(startsAt, endsAt, now = new Date()) {
    const start = new Date(startsAt).getTime();
    const end = new Date(endsAt).getTime();
    const current = now.getTime();

    if (Number.isNaN(start) || Number.isNaN(end)) return { label: '', tone: 'later' };

    if (current >= end) return { label: 'Ended', tone: 'ended' };

    if (current >= start) return { label: `Live · ${formatSpan(end - current)} left`, tone: 'live' };

    const untilStart = start - current;

    if (untilStart < MINUTE_MS) return { label: 'Starting now', tone: 'soon' };
    if (untilStart < HOUR_MS) return { label: `in ${formatSpan(untilStart)}`, tone: 'soon' };
    if (untilStart < DAY_MS) return { label: `in ${formatSpan(untilStart)}`, tone: 'today' };

    return { label: `in ${formatSpan(untilStart)}`, tone: 'later' };
}
