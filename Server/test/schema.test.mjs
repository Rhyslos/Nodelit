// schema tests: the startup schema must stay additive and never change existing data
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkSchema } from '../modules/SchemaGuard.mjs';
import { createDatabase, readSchema } from './helpers.mjs';

// configuration constants
const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');

// catalog functions
async function catalog(client) {
    const q = async sql => (await client.query(sql)).rows;

    return {
        columns: await q(`SELECT table_name, column_name, data_type, is_nullable, column_default
                          FROM information_schema.columns WHERE table_schema = 'public' ORDER BY 1, 2`),
        constraints: await q(`SELECT conrelid::regclass::text AS t, conname, pg_get_constraintdef(oid) AS def
                              FROM pg_constraint WHERE connamespace = 'public'::regnamespace ORDER BY 1, 2`),
        indexes: await q(`SELECT tablename, indexname, indexdef FROM pg_indexes WHERE schemaname = 'public' ORDER BY 1, 2`)
    };
}

async function snapshotData(client) {
    const tables = (await client.query(
        `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> 'schema_steps' ORDER BY 1`
    )).rows.map(row => row.tablename);

    const data = {};
    for (const table of tables) data[table] = (await client.query(`SELECT * FROM ${table} ORDER BY 1`)).rows;

    return data;
}

const SEED = `
    INSERT INTO users (id, username, display_name, cursor_color, salt, hash) VALUES ('u1', 'yuna', 'Yuna', '#c8502a', 's', 'h');
    INSERT INTO workspaces (id, name, owner_id) VALUES ('w1', 'Game', 'u1');
    INSERT INTO memberships VALUES ('w1', 'u1', 'owner');
    INSERT INTO tabs (id, workspace_id, name, color, tab_order, is_archived) VALUES ('t1', 'w1', 'Level', '#6c8ebf', 0, false), ('t2', 'w1', 'Old', '#6c8ebf', 1, true);
    INSERT INTO board_columns VALUES ('c1', 't1', 0), ('c2', 't2', 0);
    INSERT INTO lists (id, column_id, name, list_order) VALUES ('l1', 'c1', 'To do', 0), ('l2', 'c2', 'Old list', 0);
    INSERT INTO tasks (id, list_id, title, task_order, workspace_id) VALUES ('k1', 'l1', 'Active', 0, 'w1'), ('k2', 'l2', 'In old board', 0, 'w1');
    INSERT INTO notation_pages (id, workspace_id, title) VALUES ('p1', 'w1', 'Doc');
    INSERT INTO meetings (id, workspace_id, title, starts_at, ends_at) VALUES ('m1', 'w1', 'Sync', now(), now() + interval '1 hour');
`;

// guard tests
test('the guard rejects anything that could remove or rewrite data', () => {
    const rejected = [
        'ALTER TABLE tasks DROP COLUMN title;',
        'DROP TABLE tasks;',
        'DROP INDEX tasks_list_id_idx;',
        'ALTER TABLE tasks DROP CONSTRAINT x;',
        'TRUNCATE tasks;',
        'DELETE FROM tasks;',
        'ALTER TABLE tasks RENAME COLUMN title TO name;',
        'ALTER TABLE tasks ALTER COLUMN title TYPE integer;',
        'UPDATE tasks SET title = \'\';',
        'DO $$ BEGIN UPDATE tasks SET title = \'\'; END $$;',
        "DO $$ BEGIN IF pg_temp.run_once('x') THEN DELETE FROM tasks; END IF; END $$;"
    ];

    for (const sql of rejected) assert.notEqual(checkSchema(sql).length, 0, `should reject: ${sql}`);

    const allowed = [
        'CREATE TABLE IF NOT EXISTS a (id text PRIMARY KEY, b text REFERENCES c(id) ON DELETE CASCADE ON UPDATE CASCADE);',
        'ALTER TABLE tasks ADD COLUMN IF NOT EXISTS x text;',
        "DO $$ BEGIN IF pg_temp.run_once('x') THEN UPDATE tasks SET title = lower(title); END IF; END $$;",
        '-- DROP TABLE tasks;'
    ];

    for (const sql of allowed) assert.deepEqual(checkSchema(sql), [], `should allow: ${sql}`);
});

test('schema.sql passes the guard', async () => {
    assert.deepEqual(checkSchema(await readSchema()), []);
});

// database tests
test('a fresh database comes out the same however many times the schema runs', async () => {
    const database = await createDatabase();
    const client = await database.connect();

    try {
        const sql = await readSchema();
        await client.query(sql);
        const first = await catalog(client);

        await client.query(sql);
        assert.deepEqual(await catalog(client), first);
    } finally {
        await client.end();
        await database.drop();
    }
});

test('upgrading a database built with the previous schema keeps every row', async () => {
    const database = await createDatabase();
    const client = await database.connect();

    try {
        await client.query(await readSchema(path.join(FIXTURES, 'schema-before-archive.sql')));
        await client.query(SEED);

        const before = await snapshotData(client);
        const sql = await readSchema();
        await client.query(sql);
        await client.query(sql);
        const after = await snapshotData(client);

        for (const [table, rows] of Object.entries(before)) {
            assert.equal(after[table].length, rows.length, `${table} kept all its rows`);

            // new columns may appear; every column that already existed must keep its values
            const known = new Set(Object.keys(rows[0] ?? {}));
            const strip = row => Object.fromEntries(Object.entries(row).filter(([key]) => known.has(key) && !/^archive/.test(key)));
            const beforeRows = rows.map(strip);
            const afterRows = after[table].map(strip);

            if (table === 'tabs' || table === 'lists' || table === 'tasks') {
                // only the legacy archived board's archive markers may be filled in
                assert.deepEqual(afterRows.map(row => row.id), beforeRows.map(row => row.id));
            } else {
                assert.deepEqual(afterRows, beforeRows, `${table} is unchanged`);
            }
        }

        // the board that was archived before the Archive existed joins it, with its list and task
        const board = (await client.query("SELECT archived_via, archived_at FROM tabs WHERE id = 't2'")).rows[0];
        assert.equal(board.archived_via, 't2');
        assert.ok(board.archived_at);

        const list = (await client.query("SELECT archived_via FROM lists WHERE id = 'l2'")).rows[0];
        const task = (await client.query("SELECT archived_via FROM tasks WHERE id = 'k2'")).rows[0];
        assert.equal(list.archived_via, 't2');
        assert.equal(task.archived_via, 't2');

        const active = (await client.query("SELECT archived_at FROM tasks WHERE id = 'k1'")).rows[0];
        assert.equal(active.archived_at, null);
    } finally {
        await client.end();
        await database.drop();
    }
});
