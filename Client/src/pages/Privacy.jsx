// page imports
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { appName } from '../App';

// configuration constants
const UPDATED_ON = '28 September 2026';

// component functions
export default function Privacy() {
    const { user } = useAuth();

    return (
        <div className="privacy-root">
            <div className="privacy-header">
                <h1 className="privacy-title">Privacy policy</h1>
                <p className="privacy-subtitle">Last updated {UPDATED_ON}</p>
            </div>

            <div className="privacy-content">
                <section className="privacy-section">
                    <h2 className="privacy-section-title">Who runs {appName}</h2>
                    <p>
                        {appName} is a private app run by one person for a small group of friends. That person is
                        responsible for the data described here. Accounts are only created by the administrator, so if
                        you have an account, you know who to contact about anything on this page.
                    </p>
                </section>

                <section className="privacy-section">
                    <h2 className="privacy-section-title">What is stored</h2>
                    <ul className="privacy-list">
                        <li>
                            <strong>Your account:</strong> username, display name, role, cursor colour, theme and
                            colour palette. Your password is never stored, only a salted scrypt hash of it.
                        </li>
                        <li>
                            <strong>What you create:</strong> workspaces, boards, lists, tasks, tags, notes, uploaded
                            images, meetings and the availability you mark in the calendar, along with who created or
                            is assigned to them and when.
                        </li>
                        <li>
                            <strong>Your session:</strong> a random session ID, kept for up to 7 days or until you sign
                            out.
                        </li>
                        <li>
                            <strong>Security log:</strong> sign-ins, failed sign-in attempts, password changes and
                            administrator actions, together with the IP address they came from.
                        </li>
                    </ul>
                </section>

                <section className="privacy-section">
                    <h2 className="privacy-section-title">Cookies and browser storage</h2>
                    <p>
                        {appName} sets one cookie, <code>session_id</code>, which keeps you signed in. It is strictly
                        necessary for the app to work, so there is no cookie banner.
                    </p>
                    <p>
                        Your browser also remembers a few display preferences in local storage, such as which tab or
                        page you last had open, hidden tabs and calendar layout. These stay on your device and are
                        never sent to the server.
                    </p>
                </section>

                <section className="privacy-section">
                    <h2 className="privacy-section-title">Why it is stored</h2>
                    <p>
                        Your data is used only to run {appName} for you and the people you share workspaces with, and
                        to keep accounts secure, for example by blocking repeated failed sign-ins. That is the
                        legitimate interest this processing relies on under the GDPR.
                    </p>
                    <p>
                        There is no advertising, analytics, tracking or profiling, and your data is never sold or
                        shared for any other purpose. All fonts and scripts are served by {appName} itself, so opening
                        the app sends nothing to third parties.
                    </p>
                </section>

                <section className="privacy-section">
                    <h2 className="privacy-section-title">Who can see it</h2>
                    <ul className="privacy-list">
                        <li>
                            <strong>Workspace members</strong> see the content of workspaces they belong to, your
                            display name and cursor colour, whether you are online, and your edits as they happen.
                        </li>
                        <li>
                            <strong>The administrator</strong> can see the list of accounts and workspaces and the
                            security log, can create, reset, restore and delete accounts, and can export all data
                            for backups.
                        </li>
                        <li>
                            <strong>The hosting provider</strong>, Render, stores the server and database in its
                            Frankfurt region in the EU and acts only on the administrator's behalf. Its own technical
                            logs may briefly include IP addresses.
                        </li>
                    </ul>
                </section>

                <section className="privacy-section">
                    <h2 className="privacy-section-title">How long it is kept</h2>
                    <ul className="privacy-list">
                        <li>Sessions expire after 7 days, and immediately when you sign out or change your password.</li>
                        <li>Security log entries are deleted automatically after 90 days.</li>
                        <li>
                            Your account and content are kept for as long as you use {appName}. When an account or
                            workspace is deleted, it is first hidden so it can be restored if it was deleted by
                            mistake, and it is removed permanently once the administrator purges it.
                        </li>
                    </ul>
                </section>

                <section className="privacy-section">
                    <h2 className="privacy-section-title">Your rights</h2>
                    <p>
                        You can ask to see the data held about you, get a copy of it, have it corrected, or have it
                        permanently deleted. You can change your display name, cursor colour and theme yourself on
                        the profile page. For anything else, just ask the administrator.
                    </p>
                    <p>
                        If you think your data has been handled wrongly, you can also complain to the Norwegian Data
                        Protection Authority, Datatilsynet.
                    </p>
                </section>

                <section className="privacy-section">
                    <h2 className="privacy-section-title">Changes</h2>
                    <p>
                        If this policy changes, the date at the top will be updated, and anything significant will be
                        mentioned to everyone using {appName}.
                    </p>
                </section>
            </div>

            <div className="privacy-footer">
                <Link className="privacy-back" to={user ? '/dashboard' : '/login'}>
                    {user ? 'Back to dashboard' : 'Back to sign in'}
                </Link>
            </div>
        </div>
    );
}
