// profile tests: personal preferences are saved per person
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { apiClient, createDatabase, startServer } from './helpers.mjs';

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

test('calendar style defaults to green overlaps and can be switched per person', async () => {
    assert.equal((await api.get('/api/auth/session')).data.calendarStyle, 'overlap');

    const saved = await api.put('/api/auth/profile', { calendarStyle: 'split' });
    assert.equal(saved.status, 200);
    assert.equal(saved.data.calendarStyle, 'split');
    assert.equal((await api.get('/api/auth/session')).data.calendarStyle, 'split', 'kept after reload');

    // saving the theme leaves the calendar style alone
    await api.put('/api/auth/profile', { theme: { mode: 'dark', custom: {} } });
    assert.equal((await api.get('/api/auth/session')).data.calendarStyle, 'split');

    assert.equal((await api.put('/api/auth/profile', { calendarStyle: 'rainbow' })).status, 400);

    // other people keep their own choice
    await api.post('/api/admin/users', { username: 'friend', password: 'friend-password-1', displayName: 'Friend', role: 'member' });
    const friend = apiClient(server.base);
    await friend.login('friend', 'friend-password-1');
    assert.equal((await friend.get('/api/auth/session')).data.calendarStyle, 'overlap');

    await api.put('/api/auth/profile', { calendarStyle: 'overlap' });
    assert.equal((await api.get('/api/auth/session')).data.calendarStyle, 'overlap');
});
