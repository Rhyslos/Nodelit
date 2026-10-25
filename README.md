# Nodelit
A new online-only version of my bachelor project "Multitask".
Will update this soon with an offline installable version, and add steps for those who want to run Nodelit for themselves on Render.

## Docs

- [Backups and restore](docs/backups.md): nightly encrypted backups and how to restore them
- [Discord integration](docs/discord.md)

## Development

- `Server`: `npm test` runs the server tests against Postgres (set `TEST_DATABASE_URL`), `npm run check:schema` checks that `database/schema.sql` only adds things
- `Client`: `npm run lint`, `npm run build`
- Every pull request runs both in GitHub Actions (`.github/workflows/ci.yml`)
