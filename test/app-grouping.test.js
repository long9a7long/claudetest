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
const cssSource = fs.readFileSync(cssPath, 'utf8');

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

function extractRuleBody(css, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(escaped.replace(/\\\s+/g, '\\s+') + '\\s*\\{([^}]*)\\}');
  const match = css.match(re);
  return match ? match[1] : '';
}

test('1000000 x 10000: Subtotal, Discount and Total render fully grouped', () => {
  const dom = makeDom();
  fillAndSubmit(dom, '1000000', '10000');
  const { document } = dom.window;
  assert.equal(document.getElementById('result-subtotal').textContent, '10,000,000,000.00');
  assert.equal(document.getElementById('result-discount').textContent, '1,000,000,000.00');
  assert.equal(document.getElementById('result-total').textContent, '9,000,000,000.00');
});

test('1234.50 x 1: Subtotal renders with a single grouping comma (above the discount threshold, so Total reflects the discount)', () => {
  const dom = makeDom();
  fillAndSubmit(dom, '1234.50', '1');
  const { document } = dom.window;
  assert.equal(document.getElementById('result-subtotal').textContent, '1,234.50');
  // 1234.50 exceeds calc.js's DISCOUNT_THRESHOLD_CENTS (100.00), so a 10% discount applies
  // and Total is 1,234.50 - 123.45 = 1,111.05, not equal to Subtotal.
  assert.equal(document.getElementById('result-discount').textContent, '123.45');
  assert.equal(document.getElementById('result-total').textContent, '1,111.05');
});

test('price/quantity under the discount threshold renders equal, grouped Subtotal and Total', () => {
  const dom = makeDom();
  fillAndSubmit(dom, '99.99', '1');
  const { document } = dom.window;
  assert.equal(document.getElementById('result-subtotal').textContent, '99.99');
  assert.equal(document.getElementById('result-total').textContent, '99.99');
  assert.equal(document.getElementById('result-discount').textContent, '0.00');
});

test('19.99 x 5 renders 99.95 with no separator (below discount threshold)', () => {
  const dom = makeDom();
  fillAndSubmit(dom, '19.99', '5');
  const { document } = dom.window;
  assert.equal(document.getElementById('result-subtotal').textContent, '99.95');
  assert.equal(document.getElementById('result-total').textContent, '99.95');
  assert.equal(document.getElementById('result-discount').textContent, '0.00');
});

test('exactly 100.00 renders Subtotal 100.00, Discount 10.00, Total 90.00 with no separators', () => {
  const dom = makeDom();
  fillAndSubmit(dom, '100', '1');
  const { document } = dom.window;
  assert.equal(document.getElementById('result-subtotal').textContent, '100.00');
  assert.equal(document.getElementById('result-discount').textContent, '10.00');
  assert.equal(document.getElementById('result-total').textContent, '90.00');
});

test('"You saved" line shows a grouped amount on a large discount', () => {
  const dom = makeDom();
  fillAndSubmit(dom, '2000', '5');
  const { document } = dom.window;
  const savingsText = document.getElementById('savings').textContent;
  assert.equal(savingsText, 'You saved 1,000.00');
});

test('"You saved" line shows no separator for a small discount amount', () => {
  const dom = makeDom();
  fillAndSubmit(dom, '100', '1');
  const { document } = dom.window;
  assert.equal(document.getElementById('savings').textContent, 'You saved 10.00');
});

test('threshold hint for 99.99 reads exactly "Add 0.01 more to get 10% off"', () => {
  const dom = makeDom();
  fillAndSubmit(dom, '99.99', '1');
  const { document } = dom.window;
  assert.equal(document.getElementById('threshold-hint').textContent, 'Add 0.01 more to get 10% off');
});

test('Price and Quantity input values are unchanged before and after Calculate', () => {
  const dom = makeDom();
  const { document } = dom.window;
  const price = document.getElementById('price');
  const quantity = document.getElementById('quantity');
  price.value = '1000000';
  quantity.value = '10000';
  assert.equal(price.value, '1000000');
  assert.equal(quantity.value, '10000');

  const form = document.getElementById('calc-form');
  const submitEvent = new dom.window.Event('submit', { bubbles: true, cancelable: true });
  form.dispatchEvent(submitEvent);

  assert.equal(price.value, '1000000');
  assert.equal(quantity.value, '10000');
});

test('dispatching input events while typing "1234567" leaves the field value "1234567"', () => {
  const dom = makeDom();
  const { document } = dom.window;
  const price = document.getElementById('price');
  const digits = '1234567';
  let typed = '';
  for (const digit of digits) {
    typed += digit;
    price.value = typed;
    price.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  }
  assert.equal(price.value, '1234567');
});

test('an invalid submission keeps results hidden with no amounts shown and surfaces field errors', () => {
  const dom = makeDom();
  const { document } = dom.window;
  fillAndSubmit(dom, '-5', '3');

  assert.equal(document.getElementById('results').hidden, true);
  assert.equal(document.getElementById('result-subtotal').textContent, '');
  assert.equal(document.getElementById('result-discount').textContent, '');
  assert.equal(document.getElementById('result-total').textContent, '');
  assert.equal(document.getElementById('savings').textContent, '');
  assert.equal(document.getElementById('threshold-hint').textContent, '');
  assert.match(document.getElementById('price-error').textContent, /cannot be negative/);
});

test('a valid calculation followed by an invalid submission clears the previously grouped amounts', () => {
  const dom = makeDom();
  const { document } = dom.window;
  fillAndSubmit(dom, '1000000', '10000');
  assert.equal(document.getElementById('result-subtotal').textContent, '10,000,000,000.00');

  fillAndSubmit(dom, '', '10000');

  assert.equal(document.getElementById('results').hidden, true);
  assert.equal(document.getElementById('result-subtotal').textContent, '');
  assert.equal(document.getElementById('result-total').textContent, '');
  assert.match(document.getElementById('price-error').textContent, /Enter a price/);
});

test('320px viewport: calculating a large, fully-grouped total causes no horizontal overflow', () => {
  const dom = makeDom();
  const { window } = dom;
  Object.defineProperty(window, 'innerWidth', { value: 320, configurable: true });
  fillAndSubmit(dom, '1000000', '10000');
  assert.equal(window.document.getElementById('result-subtotal').textContent, '10,000,000,000.00');

  // jsdom performs no layout, so scrollWidth is always 0 and this assertion is vacuously
  // true; the real no-overflow guarantee is enforced below via the stylesheet rules that
  // allow the long grouped string to wrap/shrink instead of forcing horizontal scroll.
  assert.ok(window.document.documentElement.scrollWidth <= window.innerWidth);

  const totalBlock = extractRuleBody(cssSource, '.result-amount-total');
  const sharedBlock = extractRuleBody(cssSource, '.result-amount');
  const rowBlock = extractRuleBody(cssSource, '.results-row');
  const combined = `${totalBlock} ${sharedBlock}`;
  assert.match(combined, /overflow-wrap:\s*anywhere|word-break:\s*break-all/);
  assert.match(sharedBlock, /min-width:\s*0/);
  assert.match(rowBlock, /min-width:\s*0/);
});

test('Calc.formatCents supports a grouped option without changing the default ungrouped output', () => {
  assert.equal(Calc.formatCents(100000000000), '1000000000.00');
  assert.equal(Calc.formatCents(100000000000, { grouped: true }), '1,000,000,000.00');
  assert.equal(Calc.formatCents(995, { grouped: true }), '9.95');
  assert.equal(Calc.formatCents(9995, { grouped: true }), '99.95');
});
