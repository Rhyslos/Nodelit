// component imports
import { useState } from 'react';

// component functions
export default function CategoryFilter({ categories, selected, searchText, onSelect, onSearch }) {
    
    // state variables
    const [open, setOpen] = useState(false);
    
    // selection variables
    const selectedCat = categories.find(c => c.id === selected);

    return (
        <div className="catfilter" onClick={() => setOpen(!open)}>
            <div className="catfilter-trigger">
                {selectedCat ? (
                    <>
                        <span className="catfilter-dot" style={{ background: selectedCat.color }} />
                        {selectedCat.name}
                    </>
                ) : 'All categories'}
                <span className="catfilter-arrow">▼</span>
            </div>
            
            {open && (
                <div className="catfilter-dropdown" onClick={e => e.stopPropagation()}>
                    <input
                        type="text"
                        className="catfilter-search"
                        placeholder="Search..."
                        value={searchText}
                        onChange={e => onSearch(e.target.value)}
                    />
                    <div className="catfilter-list">
                        <button 
                            className={`catfilter-item ${!selected ? 'active' : ''}`} 
                            onClick={() => { onSelect(null); setOpen(false); }}
                        >
                            All categories
                        </button>
                        
                        {categories.map(c => (
                            <button 
                                key={c.id} 
                                className={`catfilter-item ${selected === c.id ? 'active' : ''}`} 
                                onClick={() => { onSelect(c.id); setOpen(false); }}
                            >
                                <span className="catfilter-dot" style={{ background: c.color }} />
                                {c.name}
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}