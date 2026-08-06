// hook imports
import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { appName } from '../App';

// ui components
export default function Login() {
    // state variables
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [submitting, setSubmitting] = useState(false);

    // hook references
    const { login } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();

    // event functions
    async function handleSubmit(e) {
        e.preventDefault();
        setError('');
        setSubmitting(true);

        try {
            await login(username, password);
            navigate(location.state?.from ?? '/dashboard', { replace: true });
        } catch (err) {
            setError(err.message || 'That username and password did not match');
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <div className="auth-root">
            <div className="auth-panel">
                <div className="auth-header">
                    <h1 className="auth-title">{appName}</h1>
                    <p className="auth-subtitle">Sign in to reach your workspaces</p>
                </div>

                {error && <div className="auth-error">{error}</div>}

                <form className="auth-form" onSubmit={handleSubmit}>
                    <div className="auth-field">
                        <label htmlFor="username">Username</label>
                        <input
                            id="username"
                            type="text"
                            autoComplete="username"
                            value={username}
                            onChange={e => setUsername(e.target.value)}
                            disabled={submitting}
                            required
                        />
                    </div>

                    <div className="auth-field">
                        <label htmlFor="password">Password</label>
                        <input
                            id="password"
                            type="password"
                            autoComplete="current-password"
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            disabled={submitting}
                            required
                        />
                    </div>

                    <button className="auth-btn" type="submit" disabled={submitting}>
                        {submitting ? 'Signing in…' : 'Sign in'}
                    </button>
                </form>
            </div>
        </div>
    );
}