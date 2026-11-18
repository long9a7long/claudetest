'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const cssPath = path.join(__dirname, '..', 'public', 'styles.css');
const css = fs.readFileSync(cssPath, 'utf8');

// --- brace-matching helpers (a plain regex mishandles nested braces) ---

function findMatchingBrace(text, openIndex) {
  let depth = 0;
  for (let i = openIndex; i < text.length; i += 1) {
    if (text[i] === '{') depth += 1;
    else if (text[i] === '}') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  throw new Error('unbalanced braces starting at index ' + openIndex);
}

function extractBlockBody(text, fromIndex) {
  const openIndex = text.indexOf('{', fromIndex);
  assert.ok(openIndex !== -1, 'expected an opening brace after index ' + fromIndex);
  const closeIndex = findMatchingBrace(text, openIndex);
  return { body: text.slice(openIndex + 1, closeIndex), start: openIndex, end: closeIndex };
}

// top-level :root { ... } (the light palette)
const rootMarker = css.indexOf(':root');
assert.ok(rootMarker !== -1, 'no :root rule found');
const lightRootBlock = extractBlockBody(css, rootMarker);
const lightRootBody = lightRootBlock.body;

// @media (prefers-color-scheme: dark) { :root { ... } }
const darkMediaMarker = css.search(/@media\s*\(\s*prefers-color-scheme\s*:\s*dark\s*\)/);
assert.ok(darkMediaMarker !== -1, 'no @media (prefers-color-scheme: dark) block found');
const darkMediaBlock = extractBlockBody(css, darkMediaMarker);
const darkMediaBody = darkMediaBlock.body;

const darkRootMarker = darkMediaBody.indexOf(':root');
assert.ok(darkRootMarker !== -1, 'dark media block does not contain a :root override');
const darkRootBlock = extractBlockBody(darkMediaBody, darkRootMarker);
const darkRootBody = darkRootBlock.body;

// --- token parsing ---

function parseCustomProperties(body) {
  const tokens = {};
  const re = /--([a-zA-Z0-9-]+)\s*:\s*([^;]+);/g;
  let match;
  while ((match = re.exec(body))) {
    tokens[match[1]] = match[2].trim();
  }
  return tokens;
}

const lightTokens = parseCustomProperties(lightRootBody);
const darkOverrideTokens = parseCustomProperties(darkRootBody);
const darkTokens = { ...lightTokens, ...darkOverrideTokens };

const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

function normalizeHex(value, label) {
  assert.match(value, HEX_RE, `token ${label} has a non-hex value: "${value}"`);
  let hex = value.slice(1);
  if (hex.length === 3) {
    hex = hex.split('').map((c) => c + c).join('');
  }
  return '#' + hex.toLowerCase();
}

const COLOR_TOKEN_NAMES = [
  'color-bg',
  'color-surface',
  'color-text',
  'color-text-secondary',
  'color-accent',
  'color-accent-hover',
  'color-accent-contrast',
  'color-error',
  'color-success',
  'color-border',
  'color-focus-ring',
  'color-input-bg'
];

const darkHex = {};
COLOR_TOKEN_NAMES.forEach((name) => {
  assert.ok(name in darkTokens, `color token --${name} is missing`);
  darkHex[name] = normalizeHex(darkTokens[name], `--${name}`);
});

// --- WCAG contrast math ---

function hexToRgb(hex) {
  const value = hex.replace('#', '');
  return {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16)
  };
}

function relativeLuminance({ r, g, b }) {
  const channel = (c) => {
    const normalized = c / 255;
    return normalized <= 0.03928
      ? normalized / 12.92
      : Math.pow((normalized + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrastRatio(hexA, hexB) {
  const lumA = relativeLuminance(hexToRgb(hexA));
  const lumB = relativeLuminance(hexToRgb(hexB));
  const lighter = Math.max(lumA, lumB);
  const darker = Math.min(lumA, lumB);
  return (lighter + 0.05) / (darker + 0.05);
}

test('styles.css declares color-scheme: light dark on :root', () => {
  assert.match(lightRootBody, /color-scheme\s*:\s*light\s+dark\s*;/);
});

test('the dark media block exists and overrides :root custom properties', () => {
  assert.ok(Object.keys(darkOverrideTokens).length > 0, 'dark :root override declares no custom properties');
});

test('dark palette: text/background pairs meet WCAG AA (>= 4.5:1)', () => {
  const pairs = [
    [darkHex['color-text'], darkHex['color-bg'], 'body text on page background'],
    [darkHex['color-text'], darkHex['color-surface'], 'body text on card'],
    [darkHex['color-text-secondary'], darkHex['color-bg'], 'muted text on page background'],
    [darkHex['color-text-secondary'], darkHex['color-surface'], 'muted text on card'],
    [darkHex['color-error'], darkHex['color-surface'], 'error text on card'],
    [darkHex['color-success'], darkHex['color-surface'], 'discount/savings text on card'],
    [darkHex['color-accent-contrast'], darkHex['color-accent'], 'button label on button background']
  ];

  pairs.forEach(([fg, bg, label]) => {
    const ratio = contrastRatio(fg, bg);
    assert.ok(ratio >= 4.5, `${label}: ${fg} on ${bg} is ${ratio.toFixed(2)}:1, expected >= 4.5:1`);
  });
});

test('dark palette: input border and focus ring meet non-text contrast (>= 3:1)', () => {
  const pairs = [
    [darkHex['color-border'], darkHex['color-input-bg'], 'input border vs input background'],
    [darkHex['color-focus-ring'], darkHex['color-input-bg'], 'focus ring vs input background'],
    [darkHex['color-focus-ring'], darkHex['color-surface'], 'focus ring vs card background'],
    [darkHex['color-focus-ring'], darkHex['color-bg'], 'focus ring vs page background']
  ];

  pairs.forEach(([fg, bg, label]) => {
    const ratio = contrastRatio(fg, bg);
    assert.ok(ratio >= 3, `${label}: ${fg} on ${bg} is ${ratio.toFixed(2)}:1, expected >= 3:1`);
  });
});

test('a :focus-visible rule covers inputs and buttons, uses the focus-ring token, and never removes the outline', () => {
  const focusVisibleRules = css.match(/([^{}]*:focus-visible[^{}]*)\{([^}]*)\}/g);
  assert.ok(focusVisibleRules && focusVisibleRules.length > 0, 'no :focus-visible rule found');

  const matchingRule = focusVisibleRules.find((rule) => {
    const selector = rule.split('{')[0];
    return selector.includes('input:focus-visible') && selector.includes('button:focus-visible');
  });
  assert.ok(matchingRule, 'no combined input/button :focus-visible rule found');
  assert.match(matchingRule, /(outline|box-shadow)\s*:[^;]*var\(--color-focus-ring\)/);

  focusVisibleRules.forEach((rule) => {
    assert.doesNotMatch(rule, /outline\s*:\s*(none|0)\b/i, `${rule} removes the outline without a replacement`);
  });
});

test('no component rule outside :root and the dark block hardcodes a color', () => {
  let stripped = css.replace(/\/\*[\s\S]*?\*\//g, '');

  // remove the top-level :root block and the whole dark media block, using
  // offsets recomputed against the comment-stripped text (comments inside
  // those blocks would otherwise shift the original offsets)
  const strippedRootMarker = stripped.indexOf(':root');
  const strippedLightRoot = extractBlockBody(stripped, strippedRootMarker);
  stripped = stripped.slice(0, strippedRootMarker) + stripped.slice(strippedLightRoot.end + 1);

  const darkStart = stripped.search(/@media\s*\(\s*prefers-color-scheme\s*:\s*dark\s*\)/);
  if (darkStart !== -1) {
    const mediaBody = extractBlockBody(stripped, darkStart);
    stripped = stripped.slice(0, darkStart) + stripped.slice(mediaBody.end + 1);
  }

  const declRe = /(color|background(?:-color)?|border(?:-color)?|outline(?:-color)?|box-shadow)\s*:\s*([^;]+);/gi;
  const allowedBare = new Set(['transparent', 'inherit', 'currentcolor', 'none']);
  let match;
  while ((match = declRe.exec(stripped))) {
    const value = match[2].trim();
    if (/var\(/.test(value)) continue;
    const bareLower = value.toLowerCase();
    if (allowedBare.has(bareLower)) continue;
    if (/^\d/.test(value) || /^(solid|dashed|dotted)\b/i.test(value)) {
      // e.g. "border: 1px solid transparent" already covered above when the color portion is a var/allowed bare word
      if (allowedBare.has(bareLower.split(/\s+/).pop())) continue;
    }
    const hasHardcodedColor = /#[0-9a-fA-F]{3,6}\b/.test(value) || /\b(rgb|rgba|hsl|hsla)\s*\(/i.test(value);
    assert.ok(
      !hasHardcodedColor,
      `declaration "${match[1]}: ${value}" outside :root/dark block uses a hardcoded color instead of var(--...)`
    );
  }
});

test('every token overridden in dark exists in the light palette, and every var(--x) used resolves to a defined token', () => {
  Object.keys(darkOverrideTokens).forEach((name) => {
    assert.ok(name in lightTokens, `dark override --${name} has no light counterpart`);
  });

  const definedNames = new Set(Object.keys(lightTokens));
  const usedNames = new Set();
  const varRe = /var\(\s*--([a-zA-Z0-9-]+)/g;
  let match;
  while ((match = varRe.exec(css))) {
    usedNames.add(match[1]);
  }
  usedNames.forEach((name) => {
    assert.ok(definedNames.has(name), `var(--${name}) is used but never defined on :root`);
  });
});

test('public/ total page weight stays within the 50 KB budget and styles.css has no external url()', () => {
  const publicDir = path.join(__dirname, '..', 'public');

  function totalSize(dir) {
    let total = 0;
    fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        total += totalSize(full);
      } else {
        total += fs.statSync(full).size;
      }
    });
    return total;
  }

  const size = totalSize(publicDir);
  assert.ok(size <= 50 * 1024, `public/ is ${size} bytes, expected <= ${50 * 1024}`);

  const externalUrl = /url\(\s*['"]?(https?:)?\/\//i;
  assert.doesNotMatch(css, externalUrl, 'styles.css references an external url()');
});

test('index.html links styles.css for both light and dark rendering', () => {
  const htmlPath = path.join(__dirname, '..', 'public', 'index.html');
  const html = fs.readFileSync(htmlPath, 'utf8');
  assert.match(html, /<link[^>]+href=["']styles\.css["']/);
});
