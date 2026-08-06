// component imports
import { useEffect, useRef } from 'react';
import { Check } from 'lucide-react';

// component functions
export default function AssigneeDropdown({ members, assigned = [], onToggle, onClose }) {
    // dom references
    const ref = useRef(null);

    // lifecycle functions
    useEffect(() => {
        function handleClickOutside(e) {
            if (ref.current && !ref.current.contains(e.target)) onClose();
        }

        document.addEventListener('click', handleClickOutside);
        return () => document.removeEventListener('click', handleClickOutside);
    }, [onClose]);

    return (
        <div className="assignee-dropdown" ref={ref}>
            <div className="assignee-dropdown-list">
                {members.map(member => (
                    <button
                        key={member.id}
                        type="button"
                        className={`assignee-dropdown-item ${assigned.includes(member.id) ? 'active' : ''}`}
                        onClick={e => { e.stopPropagation(); onToggle(member.id); }}
                    >
                        <span
                            className="assignee-dropdown-dot"
                            style={{ background: member.cursorColor }}
                        />
                        <span className="assignee-dropdown-name">{member.displayName}</span>
                        {assigned.includes(member.id) && <Check size={13} strokeWidth={2.5} />}
                    </button>
                ))}

                {members.length === 0 && (
                    <p className="assignee-dropdown-empty">No members yet</p>
                )}
            </div>
        </div>
    );
}
