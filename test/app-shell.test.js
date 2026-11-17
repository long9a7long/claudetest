'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { start } = require('../server');

const htmlPath = path.join(__dirname, '..', 'public', 'index.html');
const cssPath = path.join(__dirname, '..', 'public', 'styles.css');
const html = fs.readFileSync(htmlPath, 'utf8');
const css = fs.readFileSync(cssPath, 'utf8');

function get(server, pathName) {
  const { port } = server.address();
  return new Promise((resolve, reject) => {
    http
      .get({ host: 'localhost', port, path: pathName }, (res) => {
        let body = '';
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () => resolve({ status: res.statusCode, body }));
      })
      .on('error', reject);
  });
}

test('index.html declares lang="en"', () => {
  assert.match(html, /<html[^>]*\blang=["']en["']/i);
});

test('index.html has a viewport meta tag', () => {
  assert.match(
    html,
    /<meta[^>]*name=["']viewport["'][^>]*content=["']width=device-width,\s*initial-scale=1["']/i
  );
});

test('index.html has a single <main> element', () => {
  const mains = html.match(/<main[\s>]/gi) || [];
  assert.equal(mains.length, 1);
});

test('index.html has exactly one non-empty <h1>', () => {
  const matches = [...html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/gi)];
  assert.equal(matches.length, 1);
  assert.notEqual(matches[0][1].trim(), '');
});

test('#card sits inside <main>', () => {
  const mainMatch = html.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
  assert.ok(mainMatch, 'expected a <main> element');
  assert.match(mainMatch[1], /id=["']card["']/);
});

test('index.html references styles.css, calc.js and app.js', () => {
  assert.match(html, /<link[^>]*rel=["']stylesheet["'][^>]*href=["']styles\.css["']/);
  assert.match(html, /<script[^>]*src=["']calc\.js["']/);
  assert.match(html, /<script[^>]*src=["']app\.js["']/);
  const calcIndex = html.indexOf('calc.js');
  const appIndex = html.indexOf('app.js');
  assert.ok(calcIndex > -1 && appIndex > -1 && calcIndex < appIndex, 'calc.js must load before app.js');
});

test('styles.css defines :root color and spacing custom properties', () => {
  const rootMatch = css.match(/:root\s*{([\s\S]*?)}/);
  assert.ok(rootMatch, 'expected a :root block');
  const rootBlock = rootMatch[1];
  assert.match(rootBlock, /--color-bg:/);
  assert.match(rootBlock, /--color-surface:/);
  assert.match(rootBlock, /--color-text:/);
  assert.match(rootBlock, /--color-accent:/);
  assert.match(rootBlock, /--space-1:/);
  assert.match(rootBlock, /--space-4:/);
});

test('styles.css sets html font-size to 16px with a system font stack', () => {
  assert.match(css, /html\s*{[^}]*font-size:\s*16px;?[^}]*}/);
  assert.match(css, /system-ui/);
});

test('styles.css gives the card a max-width of 420px', () => {
  assert.match(css, /--card-max-width:\s*420px/);
  assert.match(css, /\.card\s*{[^}]*max-width:\s*var\(--card-max-width\)/);
});

test('styles.css uses 16px page padding by default and 32px at a min-width media query', () => {
  const bodyMatch = css.match(/body\s*{([\s\S]*?)}/);
  assert.ok(bodyMatch);
  assert.match(bodyMatch[1], /padding:\s*var\(--page-padding\)/);
  assert.match(css, /--page-padding:\s*16px/);
  const mediaMatch = css.match(/@media\s*\(min-width:\s*768px\)\s*{\s*body\s*{([\s\S]*?)}\s*}/);
  assert.ok(mediaMatch, 'expected a min-width media query overriding body padding');
  assert.match(mediaMatch[1], /padding:\s*32px/);
});

test('GET / returns 200 with the h1 and #card', async () => {
  const server = start(5173);
  try {
    await new Promise((resolve) => server.on('listening', resolve));
    const res = await get(server, '/');
    assert.equal(res.status, 200);
    assert.match(res.body, /<h1[^>]*>Cart Calculator<\/h1>/);
    assert.match(res.body, /id=["']card["']/);
  } finally {
    server.close();
  }
});

test('GET /styles.css, /calc.js and /app.js each return 200', async () => {
  const server = start(5174);
  try {
    await new Promise((resolve) => server.on('listening', resolve));
    const [css200, calc200, app200] = await Promise.all([
      get(server, '/styles.css'),
      get(server, '/calc.js'),
      get(server, '/app.js'),
    ]);
    assert.equal(css200.status, 200);
    assert.equal(calc200.status, 200);
    assert.equal(app200.status, 200);
  } finally {
    server.close();
  }
});
