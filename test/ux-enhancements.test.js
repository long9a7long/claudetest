'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const Calc = require('../public/calc.js');
const { init } = require('../public/app.js');

const htmlPath = path.join(__dirname, '..', 'public', 'index.html');
const appPath = path.join(__dirname, '..', 'public', 'app.js');

const html = fs.readFileSync(htmlPath, 'utf8');
const appSource = fs.readFileSync(appPath, 'utf8');

function makeDom() {
  const dom = new JSDOM(html, { runScripts: 'outside-only' });
  global.window = dom.window;
  global.document = dom.window.document;
  global.Calc = Calc;
  init();
  return dom;
}

function fillAndSubmit(dom, priceVal, quantityVal) {
  const { document } = dom.window;
  const form = document.getElementById('calc-form');
  const price = document.getElementById('price');
  const quantity = document.getElementById('quantity');
  price.value = priceVal;
  quantity.value = quantityVal;
  const submitEvent = new dom.window.Event('submit', { bubbles: true, cancelable: true });
  form.dispatchEvent(submitEvent);
  return submitEvent;
}

test('savings and hint elements exist, start hidden/empty, and are descendants of the aria-live region', () => {
  const dom = makeDom();
  const { document } = dom.window;
  const results = document.getElementById('results');
  const savings = document.getElementById('savings');
  const hint = document.getElementById('threshold-hint');

  assert.ok(savings);
  assert.ok(hint);
  assert.equal(results.getAttribute('aria-live'), 'polite');
  assert.equal(savings.closest("[aria-live='polite']"), results);
  assert.equal(hint.closest("[aria-live='polite']"), results);
  assert.equal(savings.hasAttribute('hidden'), true);
  assert.equal(hint.hasAttribute('hidden'), true);
  assert.equal(savings.textContent, '');
  assert.equal(hint.textContent, '');
});

test('price 100 x quantity 1 shows "You saved 10.00" and hides the hint', () => {
  const dom = makeDom();
  fillAndSubmit(dom, '100', '1');
  const { document } = dom.window;
  const savings = document.getElementById('savings');
  const hint = document.getElementById('threshold-hint');

  assert.equal(savings.textContent, 'You saved 10.00');
  assert.equal(savings.hasAttribute('hidden'), false);
  assert.equal(hint.textContent, '');
  assert.equal(hint.hasAttribute('hidden'), true);
});

test('price 100.01 x quantity 1 shows "You saved 10.00" (10.001 rounds half-up) and no hint', () => {
  const dom = makeDom();
  fillAndSubmit(dom, '100.01', '1');
  const { document } = dom.window;
  const savings = document.getElementById('savings');
  const hint = document.getElementById('threshold-hint');

  assert.equal(savings.textContent, 'You saved 10.00');
  assert.equal(hint.hasAttribute('hidden'), true);
  assert.equal(hint.textContent, '');
});

test('price 99.99 x quantity 1 shows the hint "Add 0.01 more to get 10% off" and no "You saved" text anywhere in results', () => {
  const dom = makeDom();
  fillAndSubmit(dom, '99.99', '1');
  const { document } = dom.window;
  const results = document.getElementById('results');
  const hint = document.getElementById('threshold-hint');
  const savings = document.getElementById('savings');

  assert.equal(hint.textContent, 'Add 0.01 more to get 10% off');
  assert.equal(hint.hasAttribute('hidden'), false);
  assert.equal(savings.hasAttribute('hidden'), true);
  assert.equal(savings.textContent, '');
  assert.doesNotMatch(results.textContent, /You saved/);
});

test('price 19.99 x quantity 1 shows the hint "Add 80.01 more to get 10% off"', () => {
  const dom = makeDom();
  fillAndSubmit(dom, '19.99', '1');
  const { document } = dom.window;
  const hint = document.getElementById('threshold-hint');

  assert.equal(hint.textContent, 'Add 80.01 more to get 10% off');
});

test('a successful calculation followed by an invalid submission hides and empties both savings and hint', () => {
  const dom = makeDom();
  const { document } = dom.window;

  fillAndSubmit(dom, '100', '1');
  assert.equal(document.getElementById('savings').textContent, 'You saved 10.00');

  fillAndSubmit(dom, 'abc', '1');

  const savings = document.getElementById('savings');
  const hint = document.getElementById('threshold-hint');
  assert.equal(savings.textContent, '');
  assert.equal(savings.hasAttribute('hidden'), true);
  assert.equal(hint.textContent, '');
  assert.equal(hint.hasAttribute('hidden'), true);
});

test('price 50 x quantity 2 shows "You saved 10.00" on screen', () => {
  const dom = makeDom();
  fillAndSubmit(dom, '50', '2');
  const { document } = dom.window;
  assert.equal(document.getElementById('savings').textContent, 'You saved 10.00');
  assert.equal(document.getElementById('savings').hasAttribute('hidden'), false);
});

test('price 40 x quantity 2 shows "Add 20.00 more to get 10% off" on screen', () => {
  const dom = makeDom();
  fillAndSubmit(dom, '40', '2');
  const { document } = dom.window;
  assert.equal(document.getElementById('threshold-hint').textContent, 'Add 20.00 more to get 10% off');
  assert.equal(document.getElementById('threshold-hint').hasAttribute('hidden'), false);
});

test('app.js does not use innerHTML for the savings or hint elements', () => {
  assert.doesNotMatch(appSource, /innerHTML/);
  assert.match(appSource, /savingsEl\.textContent/);
  assert.match(appSource, /hintEl\.textContent/);
});

test('app.js reuses Calc.remainingToThresholdCents rather than recomputing the threshold gap', () => {
  assert.match(appSource, /Calc\.remainingToThresholdCents/);
});

test('index.html defines the savings and hint elements inside #results', () => {
  assert.match(html, /<section id="results"[^>]*aria-live="polite"[\s\S]*<p id="savings"[\s\S]*<\/section>/);
  assert.match(html, /<section id="results"[^>]*aria-live="polite"[\s\S]*<p id="threshold-hint"[\s\S]*<\/section>/);
});

test('calc.js savingsCents boundary cases: 99.99 subtotal gives 0, 100.00 gives 1000, 100.01 gives 1000 (half-up)', () => {
  assert.equal(Calc.savingsCents(9999), 0);
  assert.equal(Calc.savingsCents(10000), 1000);
  assert.equal(Calc.savingsCents(10001), 1000);
});

test('calc.js remainingToThresholdCents boundary cases: 99.99 gives 1 cent, 100.00 and 100.01 give 0, 19.99 gives 8001', () => {
  assert.equal(Calc.remainingToThresholdCents(9999), 1);
  assert.equal(Calc.remainingToThresholdCents(10000), 0);
  assert.equal(Calc.remainingToThresholdCents(10001), 0);
  assert.equal(Calc.remainingToThresholdCents(1999), 8001);
});
