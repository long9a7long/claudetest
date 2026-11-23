'use strict';

// Regression: ISSUE-001: GET /api/health sent an auto-generated ETag despite
// Cache-Control: no-store, so a conditional request with If-None-Match
// returned a stale 304 instead of a fresh health check.

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

test('GET /api/health does not send an ETag and ignores If-None-Match', async () => {
  const first = await fetch(`http://localhost:${port}/api/health`);
  assert.equal(first.status, 200);
  assert.equal(first.headers.get('etag'), null);

  const conditional = await fetch(`http://localhost:${port}/api/health`, {
    headers: { 'If-None-Match': '"some-etag"' },
  });
  assert.equal(conditional.status, 200);
  const body = await conditional.json();
  assert.deepEqual(body, { status: 'ok' });
});
