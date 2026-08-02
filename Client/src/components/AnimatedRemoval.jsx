// hook imports
import { useEffect, useState } from 'react';

// ui components
export default function AnimatedRemoval({ children, removing }) {
    // state variables
    const [isMounted, setIsMounted] = useState(true);

    // lifecycle functions
    useEffect(() => {
        if (removing) {
            const timer = setTimeout(() => setIsMounted(false), 250);
            return () => clearTimeout(timer);
        }
    }, [removing]);

    if (!isMounted) return null;

    return (
        <div style={{
            transition: 'opacity 250ms ease, transform 250ms ease',
            opacity: removing ? 0 : 1,
            transform: removing ? 'scale(0.95)' : 'scale(1)'
        }}>
            {children}
        </div>
    );
}