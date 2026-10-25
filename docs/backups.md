# Backups and restore

Nodelit's data lives in one Postgres database. If that database is Render's **free** plan, it has no backups at all and Render deletes it 30 days after it was created (plus a 14-day grace period to upgrade). So either upgrade it to a paid plan, which includes daily backups, or at least turn on the backups below. Ideally do both.

## Nightly backups (GitHub Actions)

`.github/workflows/backup.yml` makes a full `pg_dump` of the database every night at around 2–3 am Oslo time. Each run also restores that dump into a throwaway database to prove it can actually be restored. The dump is encrypted, then kept for 30 days as a downloadable file on the workflow run.

The repository is public, so anyone can download those files. That's why they are always encrypted: without the passphrase they're unreadable.

### Turn it on

1. **Get the external connection string.** In Render, open the database → **Connect** → copy the **External Database URL**.
2. **Make a passphrase.** Use something long and random (for example from a password manager). Save it somewhere safe outside GitHub, because a backup can't be opened without it.
3. **Add both as secrets.** In GitHub, go to the repository → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**, and add:
   - `DATABASE_URL`: the external connection string
   - `BACKUP_PASSPHRASE`: the passphrase
4. **Run it once by hand.** Go to **Actions** → **Database backup** → **Run workflow**. The run's summary shows the restore check (number of users, workspaces and tasks) and the backup file.

If the secrets are missing, the workflow skips itself and shows a warning, so nothing fails.

## Restoring

You need [PostgreSQL client tools](https://www.postgresql.org/download/) (`pg_restore`, version 16 or newer) and `gpg`.

1. **Download the backup.** Go to **Actions** → a **Database backup** run → **Artifacts** → download, then unzip it to get `nodelit-YYYY-MM-DD.dump.gpg`.
2. **Decrypt it:**
   ```sh
   gpg --decrypt --output nodelit.dump nodelit-YYYY-MM-DD.dump.gpg
   ```
3. **Restore into an empty database.** For example, a new Render database: copy its External Database URL first.
   ```sh
   pg_restore --no-owner --no-privileges --exit-on-error --dbname "NEW_DATABASE_URL" nodelit.dump
   ```
4. **Point the server at it.** In Render, open the Nodelit web service → **Environment**, set `DATABASE_URL` to the new database's **Internal** URL, and save. Render redeploys and Nodelit starts on the restored data.

Moving off an expiring free database works the same way: run a backup, create the new database, restore into it, switch `DATABASE_URL`.

## The Export button

**Admin → Export all data** downloads a readable JSON file. It is useful for looking at your data, but it is not a backup. It leaves out user accounts and passwords, the Notation documents themselves (only their plain text) and uploaded images. Use the backups above to restore.
