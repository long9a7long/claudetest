'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('../server.js');

test('smoke: server starts and GET / returns 200 text/html', async () => {
  const server = start(0);
  try {
    await new Promise((resolve) => server.once('listening', resolve));
    const port = server.address().port;
    const res = await fetch(`http://localhost:${port}/`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type') || '', /text\/html/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
