// component imports
import { useState } from 'react';

// component functions
export default function CategoryFilter({ categories, selected, searchText, onSelect, onSearch }) {
    // state variables
    const [open, setOpen] = useState(false);
    const [categorySearch, setCategorySearch] = useState('');

    // filter variables
    const filtered = categories.filter(category => {
        const query = categorySearch.trim().toLowerCase();
        if (!query) return true;
        return category.name.toLowerCase().includes(query) || category.color.toLowerCase().includes(query);
    });

    const selectedCategory = categories.find(c => c.id === selected);

    return (
        <div className="catfilter-bar">
            <input
                className="catfilter-workspace-search"
                placeholder="Search workspaces…"
                value={searchText}
                onChange={e => onSearch(e.target.value)}
            />

            <div className="catfilter">
                <button className="catfilter-trigger" onClick={() => setOpen(o => !o)}>
                    {selectedCategory ? (
                        <>
                            <span className="catfilter-dot" style={{ background: selectedCategory.color }} />
                            <span>{selectedCategory.name}</span>
                        </>
                    ) : (
                        <span>All categories</span>
                    )}
                    <span className="catfilter-arrow">{open ? '▲' : '▼'}</span>
                </button>

                {open && (
                    <div className="catfilter-dropdown">
                        <input
                            className="catfilter-search"
                            placeholder="Find a category…"
                            value={categorySearch}
                            onChange={e => setCategorySearch(e.target.value)}
                            autoFocus
                        />

                        <div className="catfilter-list">
                            <button
                                className={`catfilter-item ${!selected ? 'active' : ''}`}
                                onClick={() => { onSelect(null); setOpen(false); }}
                            >
                                All categories
                            </button>

                            {filtered.map(category => (
                                <button
                                    key={category.id}
                                    className={`catfilter-item ${selected === category.id ? 'active' : ''}`}
                                    onClick={() => { onSelect(category.id); setOpen(false); }}
                                >
                                    <span className="catfilter-dot" style={{ background: category.color }} />
                                    {category.name}
                                </button>
                            ))}

                            {filtered.length === 0 && (
                                <p className="catfilter-empty">No categories match that</p>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
