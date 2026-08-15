// import modules
import { useRef } from 'react';

// configuration constants
const MODES = [
    { value: 'quick', label: 'Quick', title: 'Search page and group names' },
    { value: 'thorough', label: 'Thorough', title: 'Search inside page contents' }
];

// component functions
export default function SidebarSearch({ query, mode, searching, onQuery, onMode }) {
    const inputRef = useRef(null);

    return (
        <div className="notation-search">
            <div className="notation-search-field">
                <input
                    ref={inputRef}
                    className="notation-search-input"
                    type="text"
                    value={query}
                    placeholder="Search pages…"
                    onChange={event => onQuery(event.target.value)}
                    onKeyDown={event => {
                        if (event.key === 'Escape') {
                            onQuery('');
                            inputRef.current?.blur();
                        }
                    }}
                />

                {query && (
                    <button
                        className="notation-search-clear"
                        onClick={() => {
                            onQuery('');
                            inputRef.current?.focus();
                        }}
                        title="Clear search"
                    >
                        ✕
                    </button>
                )}
            </div>

            <div className="notation-search-modes">
                {MODES.map(entry => (
                    <button
                        key={entry.value}
                        className={`notation-search-mode ${mode === entry.value ? 'active' : ''}`}
                        onClick={() => onMode(entry.value)}
                        title={entry.title}
                    >
                        {entry.label}
                    </button>
                ))}

                {searching && <span className="notation-search-status">Searching…</span>}
            </div>
        </div>
    );
}
