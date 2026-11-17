'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

function runServerProcess(env) {
  return new Promise((resolve, reject) => {
    const child = spawn('node', ['server.js'], {
      cwd: path.join(__dirname, '..'),
      env,
    });
    let stdout = '';
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error(`Server did not log a listening port in time. stdout so far: ${stdout}`));
    }, 5000);
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
      const match = stdout.match(/listening on port (\d+)/);
      if (match) {
        clearTimeout(timer);
        resolve({ child, port: Number(match[1]), stdout });
      }
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

test('require("../server.js") does not bind a port', () => {
  delete require.cache[require.resolve('../server.js')];
  const { app, start } = require('../server.js');
  assert.equal(typeof app, 'function');
  assert.equal(typeof start, 'function');
});

test('server responds on an ephemeral port (port 0)', async () => {
  delete require.cache[require.resolve('../server.js')];
  const { start } = require('../server.js');
  const server = start(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const port = server.address().port;
  assert.ok(port > 0);

  try {
    const rootRes = await fetch(`http://localhost:${port}/`);
    assert.equal(rootRes.status, 200);

    const cssRes = await fetch(`http://localhost:${port}/styles.css`);
    assert.equal(cssRes.status, 200);
    assert.match(cssRes.headers.get('content-type') || '', /text\/css/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('start() defaults to port 4173 when PORT is unset', async () => {
  delete require.cache[require.resolve('../server.js')];
  const previousPort = process.env.PORT;
  delete process.env.PORT;
  const { start } = require('../server.js');
  const server = start();
  await new Promise((resolve) => server.once('listening', resolve));
  try {
    assert.equal(server.address().port, 4173);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    if (previousPort !== undefined) process.env.PORT = previousPort;
  }
});

test('start() honors process.env.PORT', async () => {
  delete require.cache[require.resolve('../server.js')];
  const previousPort = process.env.PORT;
  process.env.PORT = '5050';
  const { start } = require('../server.js');
  const server = start();
  await new Promise((resolve) => server.once('listening', resolve));
  try {
    assert.equal(server.address().port, 5050);
    const res = await fetch('http://localhost:5050/');
    assert.equal(res.status, 200);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    if (previousPort !== undefined) {
      process.env.PORT = previousPort;
    } else {
      delete process.env.PORT;
    }
  }
});

test('unknown paths do not return a successful static hit', async () => {
  delete require.cache[require.resolve('../server.js')];
  const { start } = require('../server.js');
  const server = start(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const port = server.address().port;
  try {
    const res = await fetch(`http://localhost:${port}/no-such-file.html`);
    assert.equal(res.status, 404);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('package.json declares express as the only runtime dependency and start script', () => {
  const pkgPath = path.join(__dirname, '..', 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  assert.deepEqual(Object.keys(pkg.dependencies), ['express']);
  assert.equal(pkg.scripts.start, 'node server.js');
});

test('required placeholder files and test directory exist', () => {
  const root = path.join(__dirname, '..');
  const required = [
    'server.js',
    'public/index.html',
    'public/styles.css',
    'public/app.js',
    'public/calc.js',
  ];
  for (const rel of required) {
    assert.ok(fs.existsSync(path.join(root, rel)), `${rel} should exist`);
  }
  assert.ok(fs.statSync(path.join(root, 'test')).isDirectory());
});

test('.gitignore contains node_modules and .env', () => {
  const contents = fs.readFileSync(path.join(__dirname, '..', '.gitignore'), 'utf8');
  assert.match(contents, /^node_modules\/?$/m);
  assert.match(contents, /^\.env$/m);
});

test('node server.js with no PORT set logs and listens on 4173', async () => {
  const env = { ...process.env };
  delete env.PORT;
  const { child, port } = await runServerProcess(env);
  try {
    assert.equal(port, 4173);
    const res = await fetch('http://localhost:4173/');
    assert.equal(res.status, 200);
  } finally {
    child.kill('SIGTERM');
  }
});

test('PORT=5050 node server.js logs and responds on 5050', async () => {
  const { child, port } = await runServerProcess({ ...process.env, PORT: '5050' });
  try {
    assert.equal(port, 5050);
    const res = await fetch('http://localhost:5050/');
    assert.equal(res.status, 200);
  } finally {
    child.kill('SIGTERM');
  }
});
