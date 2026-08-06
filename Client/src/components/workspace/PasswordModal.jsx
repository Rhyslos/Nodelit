// component imports
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../../lib/api';

// component functions
export default function PasswordModal({ onClose }) {
    // state variables
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState('');
    const [done, setDone] = useState(false);
    const [busy, setBusy] = useState(false);

    // event handlers
    async function handleSubmit(e) {
        e.preventDefault();
        setError('');

        if (newPassword !== confirmPassword) {
            setError('The new passwords do not match');
            return;
        }

        setBusy(true);

        try {
            await api('/api/auth/password', {
                method: 'PUT',
                body: { currentPassword, newPassword }
            });

            setDone(true);
        } catch (err) {
            setError(err.message);
        } finally {
            setBusy(false);
        }
    }

    return createPortal(
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal" onClick={e => e.stopPropagation()}>
                <h2 className="modal-title">Change password</h2>

                {done ? (
                    <>
                        <p className="admin-notice">
                            Password updated. Any other devices signed in as you have been signed out.
                        </p>
                        <div className="modal-actions">
                            <button className="modal-submit" onClick={onClose}>Done</button>
                        </div>
                    </>
                ) : (
                    <form className="modal-form" onSubmit={handleSubmit}>
                        <div className="modal-field">
                            <label htmlFor="current-password">Current password</label>
                            <input
                                id="current-password"
                                type="password"
                                autoComplete="current-password"
                                value={currentPassword}
                                onChange={e => setCurrentPassword(e.target.value)}
                                autoFocus
                            />
                        </div>

                        <div className="modal-field">
                            <label htmlFor="new-password">New password</label>
                            <input
                                id="new-password"
                                type="password"
                                autoComplete="new-password"
                                placeholder="At least 12 characters"
                                value={newPassword}
                                onChange={e => setNewPassword(e.target.value)}
                            />
                        </div>

                        <div className="modal-field">
                            <label htmlFor="confirm-password">Confirm new password</label>
                            <input
                                id="confirm-password"
                                type="password"
                                autoComplete="new-password"
                                value={confirmPassword}
                                onChange={e => setConfirmPassword(e.target.value)}
                            />
                        </div>

                        {error && <p className="modal-error">{error}</p>}

                        <div className="modal-actions">
                            <button type="button" className="modal-cancel" onClick={onClose}>Cancel</button>
                            <button type="submit" className="modal-submit" disabled={busy}>
                                {busy ? 'Saving…' : 'Update password'}
                            </button>
                        </div>
                    </form>
                )}
            </div>
        </div>,
        document.body
    );
}
