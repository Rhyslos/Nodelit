// hook imports
import { useState, useEffect } from 'react';

// configuration constants
const DEFAULT_TICK_MS = 15000;

// hook functions
export function useNow(tickMs = DEFAULT_TICK_MS) {
    // state variables
    const [now, setNow] = useState(() => new Date());

    // effects
    useEffect(() => {
        const id = setInterval(() => setNow(new Date()), tickMs);
        return () => clearInterval(id);
    }, [tickMs]);

    return now;
}
