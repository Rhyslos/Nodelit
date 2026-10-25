// test helpers: each test file gets its own fresh database and a real server process.
// Needs TEST_DATABASE_URL pointing at a Postgres the tests may create databases on,
// e.g. postgres://postgres:postgres@localhost:5432/postgres (CI provides one).
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import net from 'node:net';
import pg from 'pg';

// configuration constants
const SERVER_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
export const ADMIN = { username: 'tester', password: 'correct-horse-battery-staple', displayName: 'Tester' };

// utility functions
function adminURL() {
    const url = process.env.TEST_DATABASE_URL;
    if (!url) throw new Error('Set TEST_DATABASE_URL to a Postgres the tests can create databases on');
    return url;
}

function urlFor(database) {
    const url = new URL(adminURL());
    url.pathname = `/${database}`;
    return url.toString();
}

function freePort() {
    return new Promise((resolve, reject) => {
        const server = net.createServer();
        server.listen(0, () => {
            const { port } = server.address();
            server.close(() => resolve(port));
        });
        server.on('error', reject);
    });
}

// database functions
export async function createDatabase() {
    const name = `nodelit_test_${randomBytes(5).toString('hex')}`;
    const admin = new pg.Client({ connectionString: adminURL() });

    await admin.connect();
    await admin.query(`CREATE DATABASE ${name}`);
    await admin.end();

    const url = urlFor(name);

    return {
        url,
        async connect() {
            const client = new pg.Client({ connectionString: url });
            await client.connect();
            return client;
        },
        async drop() {
            const cleanup = new pg.Client({ connectionString: adminURL() });
            await cleanup.connect();
            await cleanup.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
            await cleanup.end();
        }
    };
}

export async function readSchema(file = path.join(SERVER_DIR, 'database', 'schema.sql')) {
    return readFile(file, 'utf8');
}

// server functions
export async function startServer(database, extraEnv = {}) {
    const port = await freePort();
    const base = `http://localhost:${port}`;
    let output = '';

    const child = spawn(process.execPath, [...(extraEnv.NODE_IMPORT ? ['--import', extraEnv.NODE_IMPORT] : []), 'server.mjs'], {
        cwd: SERVER_DIR,
        env: {
            ...process.env,
            NODE_ENV: 'test',
            PORT: String(port),
            DATABASE_URL: database.url,
            DATABASE_SSL: 'false',
            CLIENT_ORIGIN: base,
            ADMIN_USERNAME: ADMIN.username,
            ADMIN_PASSWORD: ADMIN.password,
            ADMIN_DISPLAY_NAME: ADMIN.displayName,
            ...extraEnv
        }
    });

    child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.on('data', chunk => { output += chunk; });

    for (let attempt = 0; attempt < 100; attempt++) {
        if (child.exitCode !== null) break;

        try {
            const response = await fetch(`${base}/healthz`);
            if (response.ok) return { base, output: () => output, stop: () => stopServer(child) };
        } catch {
            // not listening yet
        }

        await new Promise(resolve => setTimeout(resolve, 200));
    }

    child.kill('SIGKILL');
    throw new Error(`Server did not start:\n${output}`);
}

function stopServer(child) {
    return new Promise(resolve => {
        if (child.exitCode !== null) return resolve();
        child.once('exit', () => resolve());
        child.kill('SIGTERM');
        setTimeout(() => child.kill('SIGKILL'), 8000).unref();
    });
}

// api functions
export function apiClient(base) {
    let cookie = '';

    async function call(method, route, body) {
        const response = await fetch(base + route, {
            method,
            headers: {
                'Content-Type': 'application/json',
                'X-Requested-With': 'XMLHttpRequest',
                Origin: base,
                ...(cookie ? { Cookie: cookie } : {})
            },
            body: body === undefined ? undefined : JSON.stringify(body)
        });

        const setCookie = response.headers.get('set-cookie');
        if (setCookie) cookie = setCookie.split(';')[0];

        const text = await response.text();
        let data = text;
        try { data = JSON.parse(text); } catch { /* not json */ }

        return { status: response.status, data };
    }

    return {
        call,
        get: route => call('GET', route),
        post: (route, body) => call('POST', route, body ?? {}),
        put: (route, body) => call('PUT', route, body ?? {}),
        del: route => call('DELETE', route),
        async login(username = ADMIN.username, password = ADMIN.password) {
            const result = await call('POST', '/api/auth/login', { username, password });
            if (result.status !== 200) throw new Error(`login failed: ${JSON.stringify(result.data)}`);
            return result.data;
        }
    };
}

// builds a workspace with one board, two lists and some tasks
export async function seedBoard(api, name = 'Test workspace') {
    const workspace = (await api.post('/api/workspaces', { name })).data;
    const board = (await api.get(`/api/kanban/${workspace.id}`)).data;
    const tab = board.tabs[0];

    const columnA = (await api.post('/api/kanban/columns', { tabID: tab.id, columnIndex: 0 })).data;
    const columnB = (await api.post('/api/kanban/columns', { tabID: tab.id, columnIndex: 1 })).data;
    const todo = (await api.post('/api/kanban/lists', { columnID: columnA.id, name: 'To do' })).data;
    const done = (await api.post('/api/kanban/lists', { columnID: columnB.id, name: 'Done' })).data;

    const tasks = [];
    for (const title of ['First', 'Second', 'Third']) {
        tasks.push((await api.post('/api/kanban/tasks', { listID: todo.id, title })).data);
    }

    return { workspace, tab, columns: [columnA, columnB], lists: { todo, done }, tasks };
}
