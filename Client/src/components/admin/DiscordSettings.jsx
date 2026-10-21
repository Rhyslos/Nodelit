// component imports
import { useState, useEffect } from 'react';
import { api } from '../../lib/api';

// component functions
export default function DiscordSettings() {
    // state variables
    const [status, setStatus] = useState(null);
    const [workspaceID, setWorkspaceID] = useState('');
    const [webhookDraft, setWebhookDraft] = useState('');
    const [removeWebhook, setRemoveWebhook] = useState(false);
    const [guildID, setGuildID] = useState('');
    const [postKanban, setPostKanban] = useState(true);
    const [postMeetings, setPostMeetings] = useState(true);
    const [syncEvents, setSyncEvents] = useState(true);
    const [saving, setSaving] = useState(false);
    const [testing, setTesting] = useState(false);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [report, setReport] = useState(null);

    // data fetching
    function apply(data) {
        setStatus(data);
        setWorkspaceID(data.workspaceID ?? '');
        setGuildID(data.guildID ?? '');
        setPostKanban(data.postKanban);
        setPostMeetings(data.postMeetings);
        setSyncEvents(data.syncEvents);
        setWebhookDraft('');
        setRemoveWebhook(false);
    }

    useEffect(() => {
        let active = true;

        api('/api/admin/discord')
            .then(data => { if (active) apply(data); })
            .catch(err => { if (active) setError(err.message); });

        return () => { active = false; };
    }, []);

    // event handlers
    async function handleSave() {
        setSaving(true);
        setError('');
        setNotice('');
        setReport(null);

        const body = { workspaceID: workspaceID || null, guildID: guildID.trim(), postKanban, postMeetings, syncEvents };

        if (removeWebhook) body.webhookURL = null;
        else if (webhookDraft.trim()) body.webhookURL = webhookDraft.trim();

        try {
            const data = await api('/api/admin/discord', { method: 'PUT', body });
            apply(data);
            setNotice(data.workspaceID ? 'Saved.' : 'Saved. Discord is turned off for every workspace.');
        } catch (err) {
            setError(err.message);
        } finally {
            setSaving(false);
        }
    }

    async function handleTest() {
        setTesting(true);
        setError('');
        setNotice('');

        try {
            setReport(await api('/api/admin/discord/test', { method: 'POST' }));
        } catch (err) {
            setError(err.message);
        } finally {
            setTesting(false);
        }
    }

    // derived variables
    const eventsDisabled = status && !status.botConfigured;
    const nothingToTest = status && (!status.workspaceID || (!status.webhookSet && !status.guildID));
    const switching = status && (workspaceID || null) !== (status.workspaceID ?? null);

    return (
        <section className="admin-section admin-discord">
            <p className="discord-intro">
                Post board activity and meetings from one workspace to a Discord channel, and add its meetings as Discord events. Other workspaces never post.
            </p>

            {error && <p className="admin-error">{error}</p>}

            {!status ? (
                !error && <p className="admin-empty">Loading…</p>
            ) : (
                <div className="modal-form">
                    <div className="modal-field">
                        <label htmlFor="discord-workspace">Connected workspace</label>
                        <select
                            id="discord-workspace"
                            value={workspaceID}
                            onChange={e => setWorkspaceID(e.target.value)}
                        >
                            <option value="">None (Discord off)</option>
                            {status.workspaces.map(workspace => (
                                <option key={workspace.id} value={workspace.id}>{workspace.name}</option>
                            ))}
                        </select>
                        {switching && workspaceID && status.workspaceID && (
                            <span className="discord-hint">
                                The webhook and server below move over to this workspace when you save.
                            </span>
                        )}
                    </div>

                    <div className="modal-field">
                        <label htmlFor="discord-webhook">Update channel webhook</label>

                        {status.webhookSet && !removeWebhook ? (
                            <div className="discord-current">
                                <span>Connected <code>{status.webhookHint}</code></span>
                                <button type="button" className="discord-link-btn" onClick={() => setRemoveWebhook(true)}>
                                    Remove
                                </button>
                            </div>
                        ) : removeWebhook ? (
                            <div className="discord-current">
                                <span>Will be removed when you save</span>
                                <button type="button" className="discord-link-btn" onClick={() => setRemoveWebhook(false)}>
                                    Undo
                                </button>
                            </div>
                        ) : null}

                        {!removeWebhook && (
                            <input
                                id="discord-webhook"
                                type="password"
                                autoComplete="off"
                                placeholder={status.webhookSet ? 'Paste a new link to replace it' : 'https://discord.com/api/webhooks/…'}
                                value={webhookDraft}
                                onChange={e => setWebhookDraft(e.target.value)}
                            />
                        )}

                        <span className="discord-hint">
                            In Discord: channel settings → Integrations → Webhooks → New Webhook → Copy Webhook URL.
                        </span>
                    </div>

                    <label className="discord-toggle">
                        <input type="checkbox" checked={postKanban} onChange={e => setPostKanban(e.target.checked)} />
                        Post board activity (new, completed, assigned and moved tasks)
                    </label>

                    <label className="discord-toggle">
                        <input type="checkbox" checked={postMeetings} onChange={e => setPostMeetings(e.target.checked)} />
                        Post when meetings are booked, changed or cancelled
                    </label>

                    <div className="modal-field">
                        <label htmlFor="discord-guild">Discord server ID <span className="modal-optional">(for events)</span></label>
                        <input
                            id="discord-guild"
                            inputMode="numeric"
                            placeholder="e.g. 112233445566778899"
                            value={guildID}
                            onChange={e => setGuildID(e.target.value)}
                        />
                        <span className="discord-hint">
                            Right-click the server icon → Copy Server ID (turn on Developer Mode in Discord's Advanced settings first).
                        </span>
                    </div>

                    <label className={`discord-toggle ${eventsDisabled ? 'is-disabled' : ''}`}>
                        <input
                            type="checkbox"
                            checked={syncEvents && !eventsDisabled}
                            disabled={eventsDisabled}
                            onChange={e => setSyncEvents(e.target.checked)}
                        />
                        Create a Discord event for each meeting
                    </label>

                    {eventsDisabled && (
                        <p className="discord-hint">
                            Events need the Nodelit bot: add DISCORD_BOT_TOKEN in Render under Environment, then redeploy.
                        </p>
                    )}

                    {status.inviteURL && (
                        <a className="discord-invite" href={status.inviteURL} target="_blank" rel="noreferrer">
                            Invite the bot to your Discord server
                        </a>
                    )}

                    {report && (
                        <div className="discord-report">
                            {report.webhook && (
                                <p className={report.webhook.ok ? 'is-ok' : 'is-error'}>
                                    Channel: {report.webhook.ok ? 'test message sent' : report.webhook.error}
                                </p>
                            )}

                            {report.events && (
                                <p className={report.events.ok ? 'is-ok' : 'is-error'}>
                                    Events: {report.events.ok
                                        ? `bot can see ${report.events.guildName ?? 'the server'}`
                                        : report.events.error}
                                </p>
                            )}
                        </div>
                    )}

                    {notice && <p className="discord-notice">{notice}</p>}
                </div>
            )}

            <div className="admin-discord-actions">
                <button className="admin-btn" onClick={handleSave} disabled={!status || saving}>
                    {saving ? 'Saving…' : 'Save'}
                </button>

                <button
                    className="modal-cancel"
                    onClick={handleTest}
                    disabled={!status || testing || nothingToTest || switching}
                    title={nothingToTest || switching ? 'Save first' : 'Send a test message'}
                >
                    {testing ? 'Testing…' : 'Send test'}
                </button>
            </div>
        </section>
    );
}
