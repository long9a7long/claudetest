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

test('require("../server.js") does not bind a port or keep the process alive', () => {
  const { spawnSync } = require('node:child_process');
  const result = spawnSync('node', ['-e', "require('./server.js')"], {
    cwd: path.join(__dirname, '..'),
    timeout: 3000,
  });
  assert.equal(result.status, 0, `expected clean exit, got ${result.status}, stderr: ${result.stderr}`);
});

test('start(0) returns an http.Server on an ephemeral port and closes cleanly', async () => {
  const http = require('node:http');
  delete require.cache[require.resolve('../server.js')];
  const { start } = require('../server.js');
  const server = start(0);
  assert.ok(server instanceof http.Server);
  await new Promise((resolve) => server.once('listening', resolve));
  assert.ok(server.address().port > 0);
  await new Promise((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
});

test('GET / returns 200 with text/html content-type', async () => {
  delete require.cache[require.resolve('../server.js')];
  const { start } = require('../server.js');
  const server = start(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const port = server.address().port;
  try {
    const res = await fetch(`http://localhost:${port}/`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type') || '', /text\/html/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('unknown and sensitive paths return 404', async () => {
  delete require.cache[require.resolve('../server.js')];
  const { start } = require('../server.js');
  const server = start(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const port = server.address().port;
  try {
    for (const p of ['/nonexistent', '/server.js', '/package.json', '/api/calculate']) {
      const res = await fetch(`http://localhost:${port}${p}`);
      assert.equal(res.status, 404, `expected 404 for ${p}, got ${res.status}`);
    }
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('path traversal to /../package.json does not leak package.json contents', async () => {
  const http = require('node:http');
  delete require.cache[require.resolve('../server.js')];
  const { start } = require('../server.js');
  const server = start(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const port = server.address().port;
  try {
    const result = await new Promise((resolve, reject) => {
      const req = http.request(
        { host: 'localhost', port, path: '/../package.json', method: 'GET' },
        (res) => {
          let body = '';
          res.on('data', (chunk) => (body += chunk));
          res.on('end', () => resolve({ status: res.statusCode, body }));
        }
      );
      req.on('error', reject);
      req.end();
    });
    const isLeaked = result.status === 200 && result.body.includes('"testclaudeqa"');
    assert.equal(isLeaked, false, 'package.json must not be served via traversal');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('CSP, x-powered-by and set-cookie headers across / , /styles.css and /nonexistent', async () => {
  delete require.cache[require.resolve('../server.js')];
  const { start } = require('../server.js');
  const server = start(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const port = server.address().port;
  try {
    for (const p of ['/', '/styles.css', '/nonexistent']) {
      const res = await fetch(`http://localhost:${port}${p}`);
      assert.equal(res.headers.get('content-security-policy'), "default-src 'self'", `CSP mismatch for ${p}`);
      assert.equal(res.headers.get('set-cookie'), null, `unexpected set-cookie for ${p}`);
    }
    const rootRes = await fetch(`http://localhost:${port}/`);
    assert.equal(rootRes.headers.get('x-powered-by'), null);
    const notFoundRes = await fetch(`http://localhost:${port}/nonexistent`);
    assert.equal(notFoundRes.headers.get('x-powered-by'), null);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('public/index.html has no inline <script> bodies, inline styles or <style> blocks', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
  assert.doesNotMatch(html, /<style[\s>]/i, 'no <style> blocks allowed');
  assert.doesNotMatch(html, /\sstyle\s*=/i, 'no inline style attributes allowed');
  const scriptTags = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
  for (const [, attrs, body] of scriptTags) {
    assert.match(attrs, /\bsrc\s*=/i, 'script tags must use src, not inline bodies');
    assert.equal(body.trim(), '', 'script tags with a src must not also contain inline code');
  }
});

test('server.js has no body-parser/session/cookie middleware or extra routes, and requires only express/path/builtins', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  assert.doesNotMatch(src, /app\.post\s*\(/);
  assert.doesNotMatch(src, /app\.put\s*\(/);
  assert.doesNotMatch(src, /express\.json\s*\(/);
  assert.doesNotMatch(src, /session/i);
  assert.doesNotMatch(src, /cookie/i);

  const builtins = new Set(require('node:module').builtinModules);
  const requireCalls = [...src.matchAll(/require\(\s*['"]([^'"]+)['"]\s*\)/g)].map((m) => m[1]);
  assert.ok(requireCalls.length > 0, 'expected at least one require call');
  for (const mod of requireCalls) {
    const normalized = mod.replace(/^node:/, '');
    assert.ok(
      normalized === 'express' || normalized === 'path' || builtins.has(normalized),
      `unexpected require target: ${mod}`
    );
  }
});
