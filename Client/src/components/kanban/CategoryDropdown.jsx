// component imports
import { useState, useEffect, useRef } from 'react';

// component functions
export default function CategoryDropdown({ categories, selected, onSelect, onClose }) {
    // state variables
    const [search, setSearch] = useState('');
    const ref = useRef(null);

    // lifecycle functions
    useEffect(() => {
        function handleClickOutside(e) {
            if (ref.current && !ref.current.contains(e.target)) onClose();
        }

        document.addEventListener('click', handleClickOutside);
        return () => document.removeEventListener('click', handleClickOutside);
    }, [onClose]);

    // filter variables
    const filtered = categories.filter(c =>
        c.name.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <div className="cat-dropdown" ref={ref}>
            <input
                className="cat-dropdown-search"
                placeholder="Search category…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                autoFocus
            />

            <div className="cat-dropdown-list">
                {filtered.map(c => (
                    <button
                        key={c.id}
                        className={`cat-dropdown-item ${selected === c.name ? 'active' : ''}`}
                        onClick={() => onSelect(c)}
                    >
                        <span className="cat-dropdown-dot" style={{ background: c.color }} />
                        {c.name}
                    </button>
                ))}

                {filtered.length === 0 && (
                    <p className="cat-dropdown-empty">No categories found</p>
                )}
            </div>
        </div>
    );
}
