// database imports
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import pg from 'pg';

const { Pool } = pg;

// configuration constants
const SLOW_QUERY_MS = 500;
const SCHEMA_LOCK_ID = 4915203;
const SCHEMA_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), 'schema.sql');

// ssl configuration
function resolveSSL(connectionString) {
    if (process.env.DATABASE_SSL === 'false') return false;
    if (process.env.DATABASE_SSL === 'true') return { rejectUnauthorized: false };

    try {
        const host = new URL(connectionString).hostname;
        const isLocal = host === 'localhost' || host === '127.0.0.1';
        const isInternal = !host.includes('.');
        return isLocal || isInternal ? false : { rejectUnauthorized: false };
    } catch {
        return false;
    }
}

// pool configuration
const connectionString = process.env.DATABASE_URL;

const pool = new Pool({
    connectionString,
    ssl: resolveSSL(connectionString ?? ''),
    max: Number(process.env.DATABASE_POOL_MAX ?? 10),
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
    statement_timeout: 15000,
    query_timeout: 15000,
    application_name: 'nodelit'
});

pool.on('error', error => {
    console.error('Idle postgres client error:', error.message);
});

// query functions
export async function query(text, params = []) {
    const startedAt = Date.now();
    const result = await pool.query(text, params);
    const duration = Date.now() - startedAt;

    if (duration > SLOW_QUERY_MS) {
        console.warn(`Slow query (${duration}ms): ${text.split('\n')[0].trim()}`);
    }

    return result;
}

export async function queryOne(text, params = []) {
    const { rows } = await query(text, params);
    return rows[0] ?? null;
}

export async function withTransaction(handler) {
    const client = await pool.connect();

    try {
        await client.query('BEGIN');
        const result = await handler(client);
        await client.query('COMMIT');
        return result;
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
    } finally {
        client.release();
    }
}

// schema functions
export async function applySchema() {
    const sql = await readFile(SCHEMA_PATH, 'utf8');
    const client = await pool.connect();

    try {
        await client.query('SELECT pg_advisory_lock($1)', [SCHEMA_LOCK_ID]);
        await client.query(sql);
        console.log('Schema applied');
    } finally {
        await client.query('SELECT pg_advisory_unlock($1)', [SCHEMA_LOCK_ID]).catch(() => {});
        client.release();
    }
}

// lifecycle functions
export async function closePool() {
    await pool.end().catch(error => console.error('Pool shutdown error:', error.message));
}

export default pool;
