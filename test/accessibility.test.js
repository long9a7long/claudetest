'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const Calc = require('../public/calc.js');
const { init } = require('../public/app.js');

const htmlPath = path.join(__dirname, '..', 'public', 'index.html');
const cssPath = path.join(__dirname, '..', 'public', 'styles.css');
const html = fs.readFileSync(htmlPath, 'utf8');
const css = fs.readFileSync(cssPath, 'utf8');

function makeDom() {
  const dom = new JSDOM(html, { runScripts: 'outside-only' });
  global.window = dom.window;
  global.document = dom.window.document;
  global.Calc = Calc;
  init();
  return dom;
}

function hexToRgb(hex) {
  const value = hex.replace('#', '');
  return {
    r: parseInt(value.substring(0, 2), 16),
    g: parseInt(value.substring(2, 4), 16),
    b: parseInt(value.substring(4, 6), 16)
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

test('index.html has lang, title, single main/h1, and a form', () => {
  const dom = new JSDOM(html);
  const { document } = dom.window;

  assert.equal(document.documentElement.getAttribute('lang'), 'en');
  assert.ok(document.title && document.title.trim().length > 0);
  assert.equal(document.querySelectorAll('main').length, 1);
  assert.equal(document.querySelectorAll('h1').length, 1);
  assert.ok(document.querySelector('form'));
});

test('every input has a label whose for matches the input id', () => {
  const dom = new JSDOM(html);
  const { document } = dom.window;
  const inputs = Array.from(document.querySelectorAll('input'));

  assert.ok(inputs.length > 0);
  inputs.forEach((input) => {
    const id = input.getAttribute('id');
    assert.ok(id, 'input must have an id');
    const label = document.querySelector(`label[for="${id}"]`);
    assert.ok(label, `missing label for input#${id}`);
  });
});

test('no element has a tabindex greater than 0', () => {
  const dom = new JSDOM(html);
  const { document } = dom.window;
  const withTabindex = Array.from(document.querySelectorAll('[tabindex]'));
  withTabindex.forEach((el) => {
    const value = parseInt(el.getAttribute('tabindex'), 10);
    assert.ok(value <= 0, `element has tabindex greater than 0: ${el.outerHTML}`);
  });
});

test('DOM tab order is Price, Quantity, Calculate, Clear', () => {
  const dom = new JSDOM(html);
  const { document } = dom.window;
  const focusable = Array.from(
    document.querySelectorAll('input, button, a[href], select, textarea')
  ).filter((el) => !el.hasAttribute('disabled'));

  const labels = focusable.map((el) => el.textContent.trim() || el.id);
  assert.deepEqual(labels, ['price', 'quantity', 'Calculate', 'Clear']);
});

test('pressing Enter (native form submit) in Price or Quantity triggers calculation', () => {
  const dom = makeDom();
  const { document } = dom.window;
  const form = document.getElementById('calc-form');
  const price = document.getElementById('price');
  const quantity = document.getElementById('quantity');
  const results = document.getElementById('results');

  price.value = '100';
  quantity.value = '2';

  const submitEvent = new dom.window.Event('submit', { bubbles: true, cancelable: true });
  form.dispatchEvent(submitEvent);

  assert.equal(results.hidden, false);
  assert.equal(document.getElementById('result-total').textContent, '180.00');
});

// jsdom does not implement the browser's native "Enter submits the form" behavior,
// so this dispatches a real keydown and confirms app.js does not intercept/preventDefault
// it (which would block that native behavior), then exercises the resulting submit.
test('a real Enter keydown in Price or Quantity fires the form submit handler and runs the calculation', () => {
  const dom = makeDom();
  const { document, window } = dom.window;
  const form = document.getElementById('calc-form');
  const price = document.getElementById('price');
  const quantity = document.getElementById('quantity');
  const results = document.getElementById('results');

  let submitFired = false;
  form.addEventListener('submit', () => {
    submitFired = true;
  });

  price.value = '50';
  quantity.value = '1';
  price.focus();

  const enterOnPrice = new window.KeyboardEvent('keydown', {
    key: 'Enter',
    code: 'Enter',
    bubbles: true,
    cancelable: true
  });
  const notPrevented = price.dispatchEvent(enterOnPrice);
  assert.equal(notPrevented, true, 'app.js must not swallow Enter on Price with a keydown handler');

  if (!submitFired) {
    form.requestSubmit ? form.requestSubmit() : form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  }

  assert.equal(results.hidden, false);
  assert.equal(document.getElementById('result-total').textContent, '50.00');

  submitFired = false;
  quantity.value = '3';
  quantity.focus();
  const enterOnQuantity = new window.KeyboardEvent('keydown', {
    key: 'Enter',
    code: 'Enter',
    bubbles: true,
    cancelable: true
  });
  quantity.dispatchEvent(enterOnQuantity);
  if (!submitFired) {
    form.requestSubmit ? form.requestSubmit() : form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  }
  assert.equal(document.getElementById('result-total').textContent, '135.00');
});

test('Calculate is a submit button so Enter in a field submits natively', () => {
  const dom = new JSDOM(html);
  const { document } = dom.window;
  const calculateButton = Array.from(document.querySelectorAll('button')).find(
    (btn) => btn.textContent.trim() === 'Calculate'
  );
  assert.ok(calculateButton);
  assert.equal(calculateButton.getAttribute('type'), 'submit');
});

test('failed validation moves focus to the first invalid field', () => {
  const dom = makeDom();
  const { document } = dom.window;
  const form = document.getElementById('calc-form');
  const price = document.getElementById('price');
  const quantity = document.getElementById('quantity');

  price.value = '';
  quantity.value = '';

  const submitEvent = new dom.window.Event('submit', { bubbles: true, cancelable: true });
  form.dispatchEvent(submitEvent);

  assert.equal(document.activeElement, price);
  assert.equal(price.getAttribute('aria-invalid'), 'true');
  assert.equal(price.getAttribute('aria-describedby'), 'price-error');
});

test('Clear resets the form, clears errors/results, and returns focus to Price', () => {
  const dom = makeDom();
  const { document } = dom.window;
  const form = document.getElementById('calc-form');
  const price = document.getElementById('price');
  const quantity = document.getElementById('quantity');
  const clearButton = document.getElementById('clear');
  const results = document.getElementById('results');

  price.value = '';
  quantity.value = '';
  form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
  assert.equal(price.getAttribute('aria-invalid'), 'true');

  price.value = '10';
  quantity.value = '1';
  clearButton.dispatchEvent(new dom.window.Event('click', { bubbles: true }));

  assert.equal(price.value, '');
  assert.equal(quantity.value, '');
  assert.equal(price.hasAttribute('aria-invalid'), false);
  assert.equal(results.hidden, true);
  assert.equal(document.activeElement, price);
});

test('styles.css defines a :focus-visible rule with the required outline for inputs and buttons', () => {
  const focusVisibleBlock = css.match(/([^{}]*:focus-visible[^{}]*)\{([^}]*)\}/g);
  assert.ok(focusVisibleBlock && focusVisibleBlock.length > 0, 'no :focus-visible rule found');

  const matchingRule = focusVisibleBlock.find((rule) => {
    const selector = rule.split('{')[0];
    return selector.includes('input:focus-visible') && selector.includes('button:focus-visible');
  });
  assert.ok(matchingRule, 'no combined input/button :focus-visible rule found');
  assert.match(matchingRule, /outline:\s*2px solid var\(--color-focus-ring\)|outline:\s*2px solid #1F5EFF/i);
  assert.match(matchingRule, /outline-offset:\s*2px/);
});

test('no interactive selector sets outline: none or outline: 0 without a replacement indicator', () => {
  const rules = css.match(/([^{}]+)\{([^}]*)\}/g) || [];
  rules.forEach((rule) => {
    const [selectorPart, bodyPart] = rule.split('{');
    const body = bodyPart || '';
    const removesOutline = /outline:\s*(none|0)\b/i.test(body);
    if (!removesOutline) {
      return;
    }
    const isInteractiveSelector = /(^|[\s,])(input|button|a|select|textarea)\b/i.test(selectorPart);
    if (!isInteractiveSelector) {
      return;
    }
    const hasReplacement = /box-shadow|border|background/i.test(body);
    assert.ok(
      hasReplacement,
      `interactive selector "${selectorPart.trim()}" removes outline without a replacement indicator`
    );
  });
});

test('a prefers-reduced-motion: reduce block disables transitions and animations', () => {
  const match = css.match(/@media \(prefers-reduced-motion:\s*reduce\)\s*\{([\s\S]*?)\}\s*\}/);
  assert.ok(match, 'no prefers-reduced-motion: reduce block found');
  const body = match[1];
  assert.match(body, /transition:\s*none/);
  assert.match(body, /animation:\s*none/);
});

test('required WCAG AA text/background pairs meet a 4.5:1 contrast ratio', () => {
  const pairs = [
    ['#1A1A1A', '#F6F7F9'],
    ['#5B6470', '#FFFFFF'],
    ['#5B6470', '#F6F7F9'],
    ['#B42318', '#FFFFFF'],
    ['#067647', '#FFFFFF'],
    ['#FFFFFF', '#1F5EFF']
  ];

  pairs.forEach(([fg, bg]) => {
    const ratio = contrastRatio(fg, bg);
    assert.ok(ratio >= 4.5, `contrast ratio for ${fg} on ${bg} is ${ratio.toFixed(2)}, expected >= 4.5`);
  });
});
