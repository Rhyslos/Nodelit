// component imports
import { Timer } from 'lucide-react';
import { useNow } from '../hooks/useNow';
import { meetingCountdown } from '../lib/meetingTimer';

// component functions
export default function MeetingTimer({ startsAt, endsAt, className = '' }) {
    // derived variables
    const now = useNow();
    const { label, tone } = meetingCountdown(startsAt, endsAt, now);

    if (!label) return null;

    return (
        <span
            className={`meeting-timer is-${tone} ${className}`.trim()}
            title={new Date(startsAt).toLocaleString(undefined, {
                weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
            })}
        >
            {tone === 'live'
                ? <span className="meeting-timer-dot" aria-hidden="true" />
                : <Timer size={11} strokeWidth={2.25} aria-hidden="true" />}
            {label}
        </span>
    );
}
