// component imports
import { useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';

// component functions
export default function DeleteDropZone({ visible, isOver, registerDeleteZone }) {
    // state variables
    const [mounted, setMounted] = useState(false);

    // lifecycle functions
    useEffect(() => {
        if (!visible) {
            setMounted(false);
            return;
        }

        let inner = null;
        const outer = requestAnimationFrame(() => {
            inner = requestAnimationFrame(() => setMounted(true));
        });

        return () => {
            cancelAnimationFrame(outer);
            if (inner) cancelAnimationFrame(inner);
        };
    }, [visible]);

    if (!visible) return null;

    return (
        <div
            ref={registerDeleteZone}
            className={[
                'kanban-delete-zone',
                mounted ? 'is-mounted' : '',
                isOver ? 'is-over' : ''
            ].filter(Boolean).join(' ')}
        >
            <Trash2 size={20} strokeWidth={2} className="kanban-delete-zone-icon" />
            <span>{isOver ? 'Release to delete' : 'Drag here to delete'}</span>
        </div>
    );
}
