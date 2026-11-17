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
const cssPath = path.join(__dirname, '..', 'public', 'styles.css');

const html = fs.readFileSync(htmlPath, 'utf8');
const appSource = fs.readFileSync(appPath, 'utf8');
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

test('form, inputs and labels exist with correct attributes', () => {
  const dom = makeDom();
  const { document } = dom.window;
  const form = document.getElementById('calc-form');
  assert.ok(form, 'expected #calc-form');
  assert.equal(form.tagName, 'FORM');

  const price = document.getElementById('price');
  const quantity = document.getElementById('quantity');
  assert.equal(price.getAttribute('type'), 'text');
  assert.equal(price.getAttribute('inputmode'), 'decimal');
  assert.equal(quantity.getAttribute('type'), 'text');
  assert.equal(quantity.getAttribute('inputmode'), 'numeric');

  const priceLabel = document.querySelector('label[for="price"]');
  const quantityLabel = document.querySelector('label[for="quantity"]');
  assert.ok(priceLabel, 'expected label[for=price]');
  assert.ok(quantityLabel, 'expected label[for=quantity]');
  assert.notEqual(priceLabel.textContent.trim(), '');
  assert.notEqual(quantityLabel.textContent.trim(), '');
});

test('Calculate submit button exists with correct type and text', () => {
  const dom = makeDom();
  const { document } = dom.window;
  const button = document.querySelector('#calc-form button[type="submit"]');
  assert.ok(button, 'expected a submit button inside the form');
  assert.equal(button.textContent.trim(), 'Calculate');
});

test('results region is hidden initially and uses aria-live=polite', () => {
  const dom = makeDom();
  const { document } = dom.window;
  const results = document.getElementById('results');
  assert.ok(results);
  assert.equal(results.getAttribute('aria-live'), 'polite');
  assert.equal(results.hidden, true);
  assert.ok(results.hasAttribute('hidden'));
});

test('results region contains a dl with Subtotal, Discount, Total and a note element', () => {
  const dom = makeDom();
  const { document } = dom.window;
  const results = document.getElementById('results');
  const dl = results.querySelector('dl');
  assert.ok(dl, 'expected a <dl> inside #results');
  const terms = [...dl.querySelectorAll('dt')].map((el) => el.textContent.trim());
  assert.deepEqual(terms, ['Subtotal', 'Discount', 'Total']);
  assert.ok(document.getElementById('result-subtotal'));
  assert.ok(document.getElementById('result-discount'));
  assert.ok(document.getElementById('result-total'));
  assert.ok(document.getElementById('discount-note'));
});

test('each input has an empty error element with a unique id placed after the field', () => {
  const dom = makeDom();
  const { document } = dom.window;
  const price = document.getElementById('price');
  const quantity = document.getElementById('quantity');
  const priceError = document.getElementById('price-error');
  const quantityError = document.getElementById('quantity-error');

  assert.ok(priceError);
  assert.ok(quantityError);
  assert.notEqual(priceError.id, quantityError.id);
  assert.equal(priceError.textContent, '');
  assert.equal(quantityError.textContent, '');

  assert.equal(price.compareDocumentPosition(priceError) & dom.window.Node.DOCUMENT_POSITION_FOLLOWING, dom.window.Node.DOCUMENT_POSITION_FOLLOWING);
  assert.equal(quantity.compareDocumentPosition(quantityError) & dom.window.Node.DOCUMENT_POSITION_FOLLOWING, dom.window.Node.DOCUMENT_POSITION_FOLLOWING);
});

test('index.html has no inline <script> and no external URLs', () => {
  const scriptTags = [...html.matchAll(/<script\b[^>]*>/gi)];
  assert.ok(scriptTags.length > 0, 'expected at least one script tag');
  scriptTags.forEach((match) => {
    assert.match(match[0], /\bsrc=/i, 'every script tag must have a src attribute (no inline script)');
  });
  const inlineScriptBody = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)];
  inlineScriptBody.forEach(([, body]) => {
    assert.equal(body.trim(), '', 'script tags must not contain inline code');
  });
  assert.doesNotMatch(html, /https?:\/\//i);
});

test('submitting the form calls preventDefault and does not navigate', () => {
  const dom = makeDom();
  const submitEvent = fillAndSubmit(dom, '50', '2');
  assert.equal(submitEvent.defaultPrevented, true);
});

test('price 50 and quantity 2 produces 100.00 subtotal, 10.00 discount, 90.00 total and the 10% note', () => {
  const dom = makeDom();
  fillAndSubmit(dom, '50', '2');
  const { document } = dom.window;
  assert.equal(document.getElementById('result-subtotal').textContent, '100.00');
  assert.equal(document.getElementById('result-discount').textContent, '10.00');
  assert.equal(document.getElementById('result-total').textContent, '90.00');
  assert.equal(document.getElementById('discount-note').textContent, '10% discount applied');
  assert.equal(document.getElementById('results').hidden, false);
});

test('price 10 and quantity 5 produces 50.00 subtotal, 0.00 discount, 50.00 total and the no-discount note', () => {
  const dom = makeDom();
  fillAndSubmit(dom, '10', '5');
  const { document } = dom.window;
  assert.equal(document.getElementById('result-subtotal').textContent, '50.00');
  assert.equal(document.getElementById('result-discount').textContent, '0.00');
  assert.equal(document.getElementById('result-total').textContent, '50.00');
  assert.equal(document.getElementById('discount-note').textContent, 'No discount applied');
});

test('requestSubmit via the submit button triggers the same calculation', () => {
  const dom = makeDom();
  const { document } = dom.window;
  const form = document.getElementById('calc-form');
  document.getElementById('price').value = '50';
  document.getElementById('quantity').value = '2';
  const button = form.querySelector('button[type="submit"]');
  form.requestSubmit(button);
  assert.equal(document.getElementById('result-total').textContent, '90.00');
  assert.equal(document.getElementById('results').hidden, false);
});

test('invalid input sets error text, aria-invalid, aria-describedby and hides stale results', () => {
  const dom = makeDom();
  const { document } = dom.window;

  fillAndSubmit(dom, '50', '2');
  assert.equal(document.getElementById('results').hidden, false);

  fillAndSubmit(dom, 'abc', '2');

  const priceInput = document.getElementById('price');
  const priceError = document.getElementById('price-error');
  assert.equal(priceInput.getAttribute('aria-invalid'), 'true');
  assert.equal(priceInput.getAttribute('aria-describedby'), 'price-error');
  assert.ok(priceError.textContent.includes('Price must be a number.'));
  assert.equal(document.getElementById('results').hidden, true);
  assert.equal(document.getElementById('result-total').textContent, '');
  assert.equal(document.activeElement, priceInput);
});

test('a previously invalid field clears its aria attributes once valid again', () => {
  const dom = makeDom();
  const { document } = dom.window;

  fillAndSubmit(dom, 'abc', '2');
  assert.equal(document.getElementById('price').getAttribute('aria-invalid'), 'true');

  fillAndSubmit(dom, '50', '2');
  const priceInput = document.getElementById('price');
  assert.equal(priceInput.hasAttribute('aria-invalid'), false);
  assert.equal(priceInput.hasAttribute('aria-describedby'), false);
  assert.equal(document.getElementById('price-error').textContent, '');
});

test('app.js contains no innerHTML, outerHTML or insertAdjacentHTML usage', () => {
  assert.doesNotMatch(appSource, /innerHTML/);
  assert.doesNotMatch(appSource, /outerHTML/);
  assert.doesNotMatch(appSource, /insertAdjacentHTML/);
});

test('app.js performs no parsing or discount arithmetic of its own', () => {
  assert.doesNotMatch(appSource, /parseFloat/);
  assert.doesNotMatch(appSource, /\bNumber\(/);
  assert.doesNotMatch(appSource, /\*\s*0\.9/);
  assert.doesNotMatch(appSource, /\*\s*0\.1/);
  assert.match(appSource, /Calc\.validateInputs/);
  assert.match(appSource, /Calc\.calculate/);
  assert.match(appSource, /Calc\.formatCents/);
});

test('styles.css uses design tokens for min-height on inputs and the primary button', () => {
  assert.match(cssSource, /--control-min-height:\s*2\.75rem/);
  const inputBlock = cssSource.match(/\.field input\s*{([\s\S]*?)}/);
  const btnBlock = cssSource.match(/\.btn\s*{([\s\S]*?)}/);
  assert.ok(inputBlock, 'expected .field input rule');
  assert.ok(btnBlock, 'expected .btn rule');
  assert.match(inputBlock[1], /min-height:\s*var\(--control-min-height\)/);
  assert.match(btnBlock[1], /min-height:\s*var\(--control-min-height\)/);
});

test('styles.css keeps [hidden] effective on the results region', () => {
  assert.match(cssSource, /\.results\[hidden\]\s*{\s*display:\s*none;?\s*}/);
});

test('negative price shows the exact Calc message with aria-invalid and a hidden results panel', () => {
  const dom = makeDom();
  const { document } = dom.window;

  fillAndSubmit(dom, '-5', '2');

  const priceInput = document.getElementById('price');
  const priceError = document.getElementById('price-error');
  assert.equal(priceInput.getAttribute('aria-invalid'), 'true');
  assert.equal(priceInput.getAttribute('aria-describedby'), 'price-error');
  assert.ok(priceError.textContent.includes('Price cannot be negative.'));
  assert.equal(document.getElementById('results').hidden, true);
});

test('price abc and quantity x show two independent errors at once', () => {
  const dom = makeDom();
  const { document } = dom.window;

  fillAndSubmit(dom, 'abc', 'x');

  const priceInput = document.getElementById('price');
  const quantityInput = document.getElementById('quantity');
  const priceError = document.getElementById('price-error');
  const quantityError = document.getElementById('quantity-error');

  assert.notEqual(priceError.textContent, '');
  assert.notEqual(quantityError.textContent, '');
  assert.notEqual(priceError.textContent, quantityError.textContent);
  assert.equal(priceInput.getAttribute('aria-invalid'), 'true');
  assert.equal(quantityInput.getAttribute('aria-invalid'), 'true');
  assert.equal(priceInput.getAttribute('aria-describedby'), 'price-error');
  assert.equal(quantityInput.getAttribute('aria-describedby'), 'quantity-error');
  assert.equal(document.getElementById('results').hidden, true);
});

test('field error text carries a visible non-color prefix in addition to the message', () => {
  const dom = makeDom();
  const { document } = dom.window;

  fillAndSubmit(dom, '-5', '2');

  const priceError = document.getElementById('price-error');
  const message = 'Price cannot be negative.';
  assert.ok(priceError.textContent.length > message.length, 'expected a prefix before the message');
  assert.notEqual(priceError.textContent.charAt(0), message.charAt(0));
});

test('after a successful calculation all error elements are empty and no input is aria-invalid', () => {
  const dom = makeDom();
  const { document } = dom.window;

  fillAndSubmit(dom, 'abc', 'x');
  fillAndSubmit(dom, '50', '2');

  assert.equal(document.getElementById('price-error').textContent, '');
  assert.equal(document.getElementById('quantity-error').textContent, '');
  assert.equal(document.getElementById('price').hasAttribute('aria-invalid'), false);
  assert.equal(document.getElementById('quantity').hasAttribute('aria-invalid'), false);
});

test('a prior result is fully cleared from the document after a subsequent invalid calculation', () => {
  const dom = makeDom();
  const { document } = dom.window;

  fillAndSubmit(dom, '50', '2');
  assert.equal(document.getElementById('result-total').textContent, '90.00');

  fillAndSubmit(dom, '-5', '2');

  assert.equal(document.getElementById('results').hidden, true);
  assert.equal(document.getElementById('result-subtotal').textContent, '');
  assert.equal(document.getElementById('result-discount').textContent, '');
  assert.equal(document.getElementById('result-total').textContent, '');
  assert.equal(document.getElementById('discount-note').textContent, '');
  assert.doesNotMatch(document.body.textContent, /90\.00/);
});
