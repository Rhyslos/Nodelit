// component imports
import { useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { THEME_KEYS, THEME_LABELS, THEME_PRESETS, resolveTheme } from '../contexts/ThemeContext';
import { PALETTE } from '../lib/color';
import { usePalette } from '../hooks/usePalette';
import ColorPickerPopover from '../components/colorpicker/ColorPickerPopover';

// configuration constants
const MODES = [
    { value: 'default', label: 'Default', hint: 'The original warm paper look' },
    { value: 'dark', label: 'Dark', hint: 'Dark grey with light blue accents' },
    { value: 'custom', label: 'Custom', hint: 'Pick every colour yourself' }
];

// component functions
export default function Profile() {
    const { user, updateUser } = useAuth();
    const { palette, saveColor, forgetColor } = usePalette();

    // state variables
    const [picker, setPicker] = useState(null);
    const [displayName, setDisplayName] = useState(user?.displayName ?? '');
    const [cursorColor, setCursorColor] = useState(user?.cursorColor ?? '#c8502a');
    const [mode, setMode] = useState(user?.theme?.mode ?? 'default');
    const [custom, setCustom] = useState(() => ({
        ...THEME_PRESETS.default,
        ...resolveTheme(user?.theme),
        ...(user?.theme?.custom ?? {})
    }));

    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [busy, setBusy] = useState(false);

    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [passwordError, setPasswordError] = useState('');
    const [passwordNotice, setPasswordNotice] = useState('');

    // event handlers
    async function persist(changes, successMessage) {
        setError('');
        setNotice('');
        setBusy(true);

        try {
            const updated = await api('/api/auth/profile', { method: 'PUT', body: changes });
            updateUser(updated);
            setNotice(successMessage);
        } catch (err) {
            setError(err.message);
        } finally {
            setBusy(false);
        }
    }

    function handleSaveIdentity(e) {
        e.preventDefault();
        persist({ displayName, cursorColor }, 'Profile saved');
    }

    function handleModeChange(nextMode) {
        setMode(nextMode);
        persist({ theme: { mode: nextMode, custom } }, 'Theme updated');
    }

    function handleCustomColor(key, value) {
        const next = { ...custom, [key]: value };
        setCustom(next);
        setMode('custom');
        persist({ theme: { mode: 'custom', custom: next } }, 'Theme updated');
    }

    function handleResetCustom() {
        const next = { ...THEME_PRESETS.default };
        setCustom(next);
        persist({ theme: { mode: 'custom', custom: next } }, 'Custom colours reset');
    }

    async function handlePasswordSubmit(e) {
        e.preventDefault();
        setPasswordError('');
        setPasswordNotice('');

        if (newPassword !== confirmPassword) {
            setPasswordError('The new passwords do not match');
            return;
        }

        try {
            await api('/api/auth/password', {
                method: 'PUT',
                body: { currentPassword, newPassword }
            });

            setCurrentPassword('');
            setNewPassword('');
            setConfirmPassword('');
            setPasswordNotice('Password updated. Other devices have been signed out.');
        } catch (err) {
            setPasswordError(err.message);
        }
    }

    return (
        <div className="profile-root">
            <div className="profile-header">
                <h1 className="profile-title">Profile</h1>
                <p className="profile-subtitle">Signed in as {user?.username}</p>
            </div>

            {error && <div className="modal-error">{error}</div>}
            {notice && <div className="admin-notice">{notice}</div>}

            <div className="profile-content">
                <section className="profile-section">
                    <h2 className="profile-section-title">Identity</h2>

                    <form className="profile-form" onSubmit={handleSaveIdentity}>
                        <div className="profile-field">
                            <label htmlFor="display-name">Display name</label>
                            <input
                                id="display-name"
                                type="text"
                                value={displayName}
                                onChange={e => setDisplayName(e.target.value)}
                            />
                        </div>

                        <div className="profile-field">
                            <label>Cursor colour</label>

                            <div className="profile-color-row">
                                <button
                                    type="button"
                                    className="profile-swatch selected"
                                    style={{ background: cursorColor }}
                                    title="Choose a colour"
                                    aria-label="Choose a colour"
                                    onClick={e => setPicker({
                                        kind: 'cursor',
                                        value: cursorColor,
                                        rect: e.currentTarget.getBoundingClientRect()
                                    })}
                                />

                                <span className="profile-custom-hex">{cursorColor}</span>
                            </div>
                        </div>

                        <button className="profile-btn" type="submit" disabled={busy}>
                            {busy ? 'Saving…' : 'Save profile'}
                        </button>
                    </form>
                </section>

                <section className="profile-section">
                    <h2 className="profile-section-title">Theme</h2>

                    <div className="profile-modes">
                        {MODES.map(option => (
                            <button
                                key={option.value}
                                type="button"
                                className={`profile-mode ${mode === option.value ? 'selected' : ''}`}
                                onClick={() => handleModeChange(option.value)}
                            >
                                <span className="profile-mode-label">{option.label}</span>
                                <span className="profile-mode-hint">{option.hint}</span>
                            </button>
                        ))}
                    </div>

                    <div className={`profile-custom ${mode === 'custom' ? '' : 'is-inactive'}`}>
                        {THEME_KEYS.map(key => (
                            <div className="profile-custom-row" key={key}>
                                <span className="profile-custom-label">{THEME_LABELS[key]}</span>

                                <button
                                    type="button"
                                    className="profile-swatch"
                                    style={{ background: custom[key] }}
                                    title={`Choose ${THEME_LABELS[key]}`}
                                    aria-label={`Choose ${THEME_LABELS[key]}`}
                                    onClick={e => setPicker({
                                        kind: 'theme',
                                        key,
                                        value: custom[key],
                                        rect: e.currentTarget.getBoundingClientRect()
                                    })}
                                />

                                <span className="profile-custom-hex">{custom[key]}</span>
                            </div>
                        ))}

                        <button type="button" className="profile-btn" onClick={handleResetCustom}>
                            Reset custom colours
                        </button>
                    </div>
                </section>

                <section className="profile-section">
                    <h2 className="profile-section-title">Password</h2>

                    {passwordError && <div className="modal-error">{passwordError}</div>}
                    {passwordNotice && <div className="admin-notice">{passwordNotice}</div>}

                    <form className="profile-form" onSubmit={handlePasswordSubmit}>
                        <div className="profile-field">
                            <label htmlFor="current-password">Current password</label>
                            <input
                                id="current-password"
                                type="password"
                                autoComplete="current-password"
                                value={currentPassword}
                                onChange={e => setCurrentPassword(e.target.value)}
                            />
                        </div>

                        <div className="profile-row">
                            <div className="profile-field">
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

                            <div className="profile-field">
                                <label htmlFor="confirm-password">Confirm</label>
                                <input
                                    id="confirm-password"
                                    type="password"
                                    autoComplete="new-password"
                                    value={confirmPassword}
                                    onChange={e => setConfirmPassword(e.target.value)}
                                />
                            </div>
                        </div>

                        <button className="profile-btn" type="submit">Update password</button>
                    </form>
                </section>
            </div>

            {picker && (
                <ColorPickerPopover
                    anchorRect={picker.rect}
                    value={picker.value}
                    presets={PALETTE}
                    saved={palette}
                    onChange={next => {
                        setPicker(current => ({ ...current, value: next }));
                        if (picker.kind === 'cursor') setCursorColor(next);
                        else setCustom(current => ({ ...current, [picker.key]: next }));
                    }}
                    onCommit={next => {
                        if (picker.kind === 'theme') handleCustomColor(picker.key, next);
                    }}
                    onSave={saveColor}
                    onForget={forgetColor}
                    onClose={() => setPicker(null)}
                />
            )}
        </div>
    );
}
