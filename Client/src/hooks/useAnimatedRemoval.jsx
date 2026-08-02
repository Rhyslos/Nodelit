// hook imports
import { useState, useCallback } from 'react';

// hook functions
export function useAnimatedRemoval(onRemove, duration = 250) {
    // state variables
    const [removingIds, setRemovingIds] = useState(new Set());

    // event functions
    const triggerRemoval = useCallback((id) => {
        setRemovingIds(prev => new Set([...prev, id]));
        setTimeout(() => {
            setRemovingIds(prev => {
                const next = new Set(prev);
                next.delete(id);
                return next;
            });
            onRemove(id);
        }, duration);
    }, [onRemove, duration]);

    // state variables
    const isRemoving = useCallback((id) => removingIds.has(id), [removingIds]);

    return { triggerRemoval, isRemoving };
}