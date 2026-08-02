// imports
import { useState } from 'react';

// constants
const PRESET_COLORS = ['#c8502a', '#4a90d9', '#7ab648', '#e6a817', '#9b59b6', '#e84393'];

// component functions
export default function CreateWorkspaceModal({ categories, onConfirm, onClose, onCreateCategory }) {
    
    // state variables
    const [name, setName] = useState('');
    const [categoryID, setCategoryID] = useState('');
    const [newCatName, setNewCatName] = useState('');
    const [newCatColor, setNewCatColor] = useState(PRESET_COLORS[0]);
    const [showNewCat, setShowNewCat] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    // event handlers
    async function handleSubmit(e) {
        e.preventDefault();
        if (!name.trim()) return setError('Workspace name is required.');
        setLoading(true);
        try {
            await onConfirm(name.trim(), categoryID || null);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }

    async function handleCreateCategory() {
        if (!newCatName.trim()) return;
        const cat = await onCreateCategory(newCatName.trim(), newCatColor);
        setCategoryID(cat.id);
        setNewCatName('');
        setShowNewCat(false);
    }

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal" onClick={e => e.stopPropagation()}>
                <h2 className="modal-title">New workspace</h2>

                <form className="modal-form" onSubmit={handleSubmit}>
                    <div className="modal-field">
                        <label>Name</label>
                        <input
                            type="text"
                            placeholder="e.g. Calculus project"
                            value={name}
                            onChange={e => setName(e.target.value)}
                            autoFocus
                        />
                    </div>

                    <div className="modal-field">
                        <label>Category <span className="modal-optional">(optional)</span></label>
                        <select value={categoryID} onChange={e => setCategoryID(e.target.value)}>
                            <option value="">No category</option>
                            {categories.map(c => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                        </select>
                    </div>

                    <button
                        type="button"
                        className="modal-new-cat-toggle"
                        onClick={() => setShowNewCat(o => !o)}
                    >
                        {showNewCat ? '− Cancel new category' : '+ Create new category'}
                    </button>

                    {showNewCat && (
                        <div className="modal-new-cat">
                            <input
                                type="text"
                                placeholder="Category name"
                                value={newCatName}
                                onChange={e => setNewCatName(e.target.value)}
                            />
                            <div className="modal-colors">
                                {PRESET_COLORS.map(c => (
                                    <button
                                        key={c}
                                        type="button"
                                        className={`modal-color-dot ${newCatColor === c ? 'selected' : ''}`}
                                        style={{ background: c }}
                                        onClick={() => setNewCatColor(c)}
                                    />
                                ))}
                            </div>
                            <button type="button" className="modal-create-cat-btn" onClick={handleCreateCategory}>
                                Add category
                            </button>
                        </div>
                    )}

                    {error && <p className="modal-error">{error}</p>}

                    <div className="modal-actions">
                        <button type="button" className="modal-cancel" onClick={onClose}>Cancel</button>
                        <button type="submit" className="modal-submit" disabled={loading}>
                            {loading ? 'Creating…' : 'Create workspace'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}