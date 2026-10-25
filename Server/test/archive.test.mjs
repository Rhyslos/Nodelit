// archive tests: deleting sends things to the Archive, where they can be opened, restored or deleted for good
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { apiClient, createDatabase, seedBoard, startServer } from './helpers.mjs';

let database;
let server;
let api;

before(async () => {
    database = await createDatabase();
    server = await startServer(database);
    api = apiClient(server.base);
    await api.login();
});

after(async () => {
    await server?.stop();
    await database?.drop();
});

// utility functions
async function board(workspaceID) {
    return (await api.get(`/api/kanban/${workspaceID}`)).data;
}

async function archive(workspaceID) {
    return (await api.get(`/api/archive/${workspaceID}`)).data.items;
}

async function sql(text, params) {
    const client = await database.connect();
    try {
        return (await client.query(text, params)).rows;
    } finally {
        await client.end();
    }
}

// task tests
test('a deleted task goes to the Archive and can be opened, restored and deleted for good', async () => {
    const { workspace, tasks, lists } = await seedBoard(api, 'Tasks');
    const [first] = tasks;

    assert.equal((await api.del(`/api/kanban/tasks/${first.id}`)).status, 200);

    const afterDelete = await board(workspace.id);
    assert.ok(!afterDelete.tasks.some(task => task.id === first.id), 'gone from the board');

    const items = await archive(workspace.id);
    const entry = items.find(item => item.id === first.id);
    assert.equal(entry.kind, 'task');
    assert.equal(entry.title, 'First');
    assert.equal(entry.archivedBy, 'Tester');
    assert.equal(entry.context.list, 'To do');

    const opened = (await api.get(`/api/archive/task/${first.id}`)).data;
    assert.equal(opened.title, 'First');
    assert.equal(opened.listName, 'To do');

    assert.equal((await api.post(`/api/archive/task/${first.id}/restore`)).status, 200);

    const restored = (await board(workspace.id)).tasks.filter(task => task.listID === lists.todo.id)
        .sort((a, b) => a.taskOrder - b.taskOrder);
    assert.equal(restored.at(-1).id, first.id, 'restored at the bottom of its list');
    assert.ok(!(await archive(workspace.id)).some(item => item.id === first.id), 'gone from the Archive');

    await api.del(`/api/kanban/tasks/${first.id}`);
    assert.equal((await api.del(`/api/archive/task/${first.id}`)).status, 200);
    assert.equal((await sql('SELECT id FROM tasks WHERE id = $1', [first.id])).length, 0, 'deleted for good');
    assert.equal((await api.get(`/api/archive/task/${first.id}`)).status, 404);
});

test('only archived things can be deleted for good', async () => {
    const { tasks } = await seedBoard(api, 'Guard');
    assert.equal((await api.del(`/api/archive/task/${tasks[0].id}`)).status, 404);
    assert.equal((await sql('SELECT id FROM tasks WHERE id = $1', [tasks[0].id])).length, 1);
});

// list tests
test('a deleted list takes its tasks with it and comes back with them', async () => {
    const { workspace, tasks, lists, columns } = await seedBoard(api, 'Lists');
    const [first, second, third] = tasks;

    // one task was archived on its own before the list
    await api.del(`/api/kanban/tasks/${third.id}`);
    assert.equal((await api.del(`/api/kanban/lists/${lists.todo.id}`)).status, 200);

    const afterDelete = await board(workspace.id);
    assert.ok(!afterDelete.lists.some(list => list.id === lists.todo.id));
    assert.ok(!afterDelete.tasks.some(task => [first.id, second.id].includes(task.id)));
    assert.ok(afterDelete.columns.every(column => column.columnIndex >= 0), 'the hidden archive column never reaches the app');
    assert.deepEqual(afterDelete.columns.map(column => column.columnIndex), [0], 'the emptied column closed up');

    const items = await archive(workspace.id);
    assert.equal(items.find(item => item.id === lists.todo.id).context.tasks, 2);
    assert.ok(items.some(item => item.id === third.id), 'the separately archived task is listed on its own');

    const blocked = await api.post(`/api/archive/task/${third.id}/restore`);
    assert.equal(blocked.status, 409, 'a task cannot come back into an archived list');

    assert.equal((await api.post(`/api/archive/list/${lists.todo.id}/restore`)).status, 200);

    const restored = await board(workspace.id);
    assert.ok(restored.lists.some(list => list.id === lists.todo.id));
    assert.deepEqual(
        restored.tasks.filter(task => task.listID === lists.todo.id).map(task => task.id).sort(),
        [first.id, second.id].sort(),
        'its tasks came back, the separately archived one did not'
    );
    assert.equal((await sql('SELECT count(*)::int AS n FROM board_columns WHERE tab_id = $1 AND column_index < 0', [columns[0].tabID]))[0].n, 0,
        'the hidden archive column is cleaned up');

    assert.equal((await api.post(`/api/archive/task/${third.id}/restore`)).status, 200);
});

test('deleting a column archives each of its lists', async () => {
    const { workspace, columns, lists } = await seedBoard(api, 'Columns');
    assert.equal((await api.del(`/api/kanban/columns/${columns[0].id}`)).status, 200);

    const items = await archive(workspace.id);
    assert.ok(items.some(item => item.kind === 'list' && item.id === lists.todo.id));
    assert.equal((await sql('SELECT count(*)::int AS n FROM tasks WHERE list_id = $1', [lists.todo.id]))[0].n, 3, 'tasks kept');
});

// board tests
test('archiving or deleting a board sends it to the Archive with everything on it', async () => {
    const { workspace, tab } = await seedBoard(api, 'Boards');
    const extra = (await api.post('/api/kanban/tabs', { workspaceID: workspace.id, name: 'Second' })).data;

    assert.equal((await api.put(`/api/kanban/tabs/${tab.id}`, { isArchived: true })).status, 200);

    const afterArchive = await board(workspace.id);
    assert.equal(afterArchive.tabs.find(item => item.id === tab.id).isArchived, true);
    assert.equal(afterArchive.lists.length, 0);
    assert.equal(afterArchive.tasks.length, 0);

    const entry = (await archive(workspace.id)).find(item => item.id === tab.id);
    assert.equal(entry.kind, 'board');
    assert.equal(entry.context.lists, 2);
    assert.equal(entry.context.tasks, 3);

    const opened = (await api.get(`/api/archive/board/${tab.id}`)).data;
    assert.equal(opened.lists.find(list => list.name === 'To do').tasks.length, 3);

    assert.equal((await api.post(`/api/archive/board/${tab.id}/restore`)).status, 200);
    const restored = await board(workspace.id);
    assert.equal(restored.tabs.find(item => item.id === tab.id).isArchived, false);
    assert.equal(restored.tasks.length, 3);

    assert.equal((await api.del(`/api/kanban/tabs/${extra.id}`)).status, 200);
    assert.ok((await archive(workspace.id)).some(item => item.id === extra.id));
    assert.equal((await api.del(`/api/archive/board/${extra.id}`)).status, 200);
    assert.equal((await sql('SELECT id FROM tabs WHERE id = $1', [extra.id])).length, 0);
});

// overview tests
test('archived tasks leave the Overview numbers', async () => {
    const { workspace, tasks } = await seedBoard(api, 'Stats');
    const total = async () => (await api.get(`/api/kanban/${workspace.id}/stats?weeks=4`)).data.headline.total;

    assert.equal(await total(), 3);
    await api.del(`/api/kanban/tasks/${tasks[0].id}`);
    assert.equal(await total(), 2);
});

// notation tests
test('a deleted page goes to the Archive and leaves search', async () => {
    const workspace = (await api.post('/api/workspaces', { name: 'Pages' })).data;
    const page = (await api.post('/api/notation/pages', { workspaceID: workspace.id, title: 'Design doc' })).data;
    await sql(`INSERT INTO notation_documents (page_id, state, content) VALUES ($1, '\\x00', 'boss arena notes')`, [page.id]);

    const search = async () => (await api.get(`/api/notation/${workspace.id}/search?q=arena`)).data.pages;
    assert.deepEqual(await search(), [page.id]);

    assert.equal((await api.del(`/api/notation/pages/${page.id}`)).status, 200);
    assert.ok(!(await api.get(`/api/notation/${workspace.id}`)).data.pages.some(item => item.id === page.id));
    assert.deepEqual(await search(), []);

    const opened = (await api.get(`/api/archive/page/${page.id}`)).data;
    assert.equal(opened.content, 'boss arena notes');

    assert.equal((await api.post(`/api/archive/page/${page.id}/restore`)).status, 200);
    assert.ok((await api.get(`/api/notation/${workspace.id}`)).data.pages.some(item => item.id === page.id));
});

// meeting tests
test('a deleted meeting leaves the calendar and comes back', async () => {
    const workspace = (await api.post('/api/workspaces', { name: 'Meetings' })).data;
    const startsAt = new Date(Date.now() + 86400000).toISOString();
    const endsAt = new Date(Date.now() + 90000000).toISOString();
    const meeting = (await api.post(`/api/calendar/${workspace.id}/meetings`, { title: 'Sync', startsAt, endsAt })).data;

    const range = async () => (await api.get(
        `/api/calendar/${workspace.id}?from=${new Date(Date.now() - 86400000).toISOString()}&to=${new Date(Date.now() + 5 * 86400000).toISOString()}`
    )).data.meetings;

    assert.equal((await api.del(`/api/calendar/meetings/${meeting.id}`)).status, 200);
    assert.deepEqual(await range(), []);
    assert.ok((await archive(workspace.id)).some(item => item.kind === 'meeting' && item.id === meeting.id));

    assert.equal((await api.post(`/api/archive/meeting/${meeting.id}/restore`)).status, 200);
    assert.equal((await range()).length, 1);
});

// access tests
test('read-only members can look in the Archive but not change it', async () => {
    const { workspace, tasks } = await seedBoard(api, 'Access');
    await api.del(`/api/kanban/tasks/${tasks[0].id}`);

    const viewer = (await api.post('/api/admin/users', {
        username: 'viewer', password: 'viewer-password-123', displayName: 'Viewer', role: 'member'
    })).data;
    await api.put(`/api/workspaces/${workspace.id}/members/${viewer.id}`, { role: 'viewer' });

    const viewerAPI = apiClient(server.base);
    await viewerAPI.login('viewer', 'viewer-password-123');

    assert.equal((await viewerAPI.get(`/api/archive/${workspace.id}`)).status, 200);
    assert.equal((await viewerAPI.post(`/api/archive/task/${tasks[0].id}/restore`)).status, 403);
    assert.equal((await viewerAPI.del(`/api/archive/task/${tasks[0].id}`)).status, 403);

    const outsider = apiClient(server.base);
    await api.post('/api/admin/users', { username: 'outsider', password: 'outsider-password-1', displayName: 'Out', role: 'member' });
    await outsider.login('outsider', 'outsider-password-1');
    assert.equal((await outsider.get(`/api/archive/${workspace.id}`)).status, 404);
    assert.equal((await outsider.get(`/api/archive/task/${tasks[0].id}`)).status, 404);
});
