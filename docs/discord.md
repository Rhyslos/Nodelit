# Discord integration

Nodelit can post workspace activity to a Discord channel and turn meetings into Discord events. It only sends from Nodelit to Discord, and runs inside the existing Nodelit server, so there is nothing extra to host.

## What gets posted

**Board activity** is collected for about a minute and posted as one message, so typing a title or dragging cards around doesn't flood the channel. It covers:

- tasks added, completed or reopened
- people assigned to tasks
- tasks moved between lists
- due dates set
- new boards

**Meetings** are posted straight away when they are booked, changed or cancelled. Times use Discord timestamps, so everyone sees them in their own timezone.

**Discord events** (optional) are created for each upcoming meeting, and kept in sync when the meeting is moved, renamed or deleted. Discord reminds people who marked themselves "Interested" when the event starts.

Nobody is ever @-mentioned by these posts.

## Setup

### 1. Update channel (no bot needed)

1. In Discord, open the channel's settings → **Integrations** → **Webhooks** → **New Webhook**, then **Copy Webhook URL**.
2. In Nodelit, open the workspace and click **Discord** in the top bar (owners only).
3. Paste the link, choose what to post, click **Save**, then **Send test**.

Each workspace has its own settings, so several workspaces can post to one Discord server, or each to its own.

### 2. Meetings as Discord events (needs the bot, one-time server setup)

1. Go to <https://discord.com/developers/applications> → **New Application** (call it Nodelit).
2. Under **Bot**, click **Reset Token** and copy the token. The bot does not need any privileged intents.
3. In Render, open the Nodelit web service → **Environment** and add:
   - `DISCORD_BOT_TOKEN`: the bot token
   - `DISCORD_APPLICATION_ID`: the Application ID from **General Information** (this makes the invite link appear in Nodelit)
   - `PUBLIC_URL` (optional): Nodelit's address, e.g. `https://nodelit.onrender.com`. Used for links in posts and as the event location. Falls back to the first `CLIENT_ORIGIN`.
4. Redeploy. Then in Nodelit's **Discord** window, click **Invite the bot to your Discord server** and pick the server. It only asks for the **Create Events** permission.
5. Paste the **Discord server ID** (in Discord: Settings → Advanced → turn on Developer Mode, then right-click the server icon → **Copy Server ID**), tick **Create a Discord event for each meeting**, **Save**, then **Send test**.

## Notes

- The webhook link works like a password for posting to that channel. Nodelit stores it, only workspace owners can change it, and it is never shown again after saving.
- Meetings that have already started don't get an event, since Discord only accepts events in the future.
- On Render's free plan the server sleeps after 15 minutes without visitors. That's fine here: Nodelit only posts when someone is using it, so the server is awake anyway. Board activity waiting to be posted is sent when the server shuts down.
- If Discord is down or a setting is wrong, Nodelit carries on as normal and logs a warning. Nothing in Nodelit waits on Discord.

## Database

Two new tables, nothing changed in existing ones:

- `workspace_discord`: one row per workspace with its webhook link, Discord server ID and toggles.
- `meeting_discord_events`: links each meeting to the Discord event made for it, so edits and deletes reach the right event.
