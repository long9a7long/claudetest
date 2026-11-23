'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

let server;
let port;

test.before(async () => {
  delete require.cache[require.resolve('../server.js')];
  const { start } = require('../server.js');
  server = start(0);
  await new Promise((resolve) => server.once('listening', resolve));
  port = server.address().port;
});

test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

test('GET /api/health returns 200 with status ok body and no-store header', async () => {
  const res = await fetch(`http://localhost:${port}/api/health`);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('cache-control'), 'no-store');
  assert.match(res.headers.get('content-type') || '', /application\/json/);
  const body = await res.json();
  assert.deepEqual(body, { status: 'ok' });
});

test('GET /api/health is registered before the 404 fallback', async () => {
  const res = await fetch(`http://localhost:${port}/api/health`);
  assert.notEqual(res.status, 404);
});
