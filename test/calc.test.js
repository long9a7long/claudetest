'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const Calc = require('../public/calc.js');
const calcSource = fs.readFileSync(path.join(__dirname, '..', 'public', 'calc.js'), 'utf8');

test('module load: require returns an object without throwing', () => {
  assert.equal(typeof Calc, 'object');
  assert.ok(Calc !== null);
});

test('module load: simulated browser global attaches the same API', () => {
  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(calcSource, sandbox);
  assert.equal(typeof sandbox.Calc, 'object');
  assert.deepEqual(Object.keys(sandbox.Calc).sort(), Object.keys(Calc).sort());
  assert.equal(sandbox.Calc.DISCOUNT_RATE, Calc.DISCOUNT_RATE);
  assert.equal(sandbox.Calc.parsePriceToCents('19.99').value, 1999);
});

test('static source checks: no require/import/document/window outside wrapper', () => {
  assert.doesNotMatch(calcSource, /\brequire\s*\(/);
  assert.doesNotMatch(calcSource, /^\s*import\b/m);
  assert.doesNotMatch(calcSource, /\bdocument\b/);
  assert.doesNotMatch(calcSource, /\bwindow\b/);
});

test('constants: values and frozen state', () => {
  assert.equal(Calc.DISCOUNT_RATE, 0.1);
  assert.equal(Calc.DISCOUNT_THRESHOLD_CENTS, 10000);
  assert.equal(Calc.MAX_PRICE, 1000000);
  assert.equal(Calc.MAX_QUANTITY, 10000);
  assert.ok(Object.isFrozen(Calc.CONSTANTS));
  assert.ok(Object.isFrozen(Calc));
});

test('parsePriceToCents: accepted values', () => {
  const cases = [
    ['19.99', 1999],
    [' 5 ', 500],
    ['0.5', 50],
    ['0', 0],
    ['1000000.00', 100000000],
    ['1.10', 110],
    ['0.07', 7],
    ['.5', 50],
    ['5.', 500]
  ];
  for (const [input, expected] of cases) {
    const result = Calc.parsePriceToCents(input);
    assert.equal(result.ok, true, `expected ok for ${JSON.stringify(input)}`);
    assert.equal(result.value, expected, `expected ${expected} for ${JSON.stringify(input)}`);
  }
});

test('parsePriceToCents: rejects non-numeric with reason non-numeric', () => {
  for (const input of ['1e3', '12,5', 'abc', 'Infinity', 'NaN', '+5', '']) {
    const result = Calc.parsePriceToCents(input);
    assert.equal(result.ok, false);
    assert.equal(result.reason, input === '' ? 'empty' : 'non-numeric');
  }
});

test('parsePriceToCents: rejects too many decimals distinctly', () => {
  const result = Calc.parsePriceToCents('1.999');
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'too-many-decimals');
  assert.notEqual(result.reason, 'non-numeric');
});

test('parsePriceToCents: rejects negative values', () => {
  const result = Calc.parsePriceToCents('-5');
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'negative');
});

test('parsePriceToCents: rejects empty and dot-only input', () => {
  assert.equal(Calc.parsePriceToCents('').reason, 'empty');
  assert.equal(Calc.parsePriceToCents('   ').reason, 'empty');
  assert.equal(Calc.parsePriceToCents('.').reason, 'non-numeric');
});

test('parseQuantity: accepted values', () => {
  assert.equal(Calc.parseQuantity('5').value, 5);
  assert.equal(Calc.parseQuantity('0').value, 0);
  assert.equal(Calc.parseQuantity(' 7 ').value, 7);
});

test('parseQuantity: rejects non-numeric', () => {
  for (const input of ['2.5', '1e3', 'abc']) {
    const result = Calc.parseQuantity(input);
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'non-numeric');
  }
});

test('parseQuantity: rejects negative with reason negative', () => {
  assert.deepEqual(Calc.parseQuantity('-3'), { ok: false, reason: 'negative' });
});

test('validateInputs: both fields empty', () => {
  const result = Calc.validateInputs('', '');
  assert.equal(result.valid, false);
  assert.equal(result.errors.price, 'Enter a price.');
  assert.equal(result.errors.quantity, 'Enter a quantity.');
});

test('validateInputs: whitespace-only price treated as empty, quantity error absent', () => {
  const result = Calc.validateInputs('   ', '3');
  assert.equal(result.valid, false);
  assert.equal(result.errors.price, 'Enter a price.');
  assert.equal('quantity' in result.errors, false);
});

test('validateInputs: non-numeric messages', () => {
  for (const input of ['abc', '1e3', '12,5', 'Infinity', 'NaN']) {
    assert.equal(Calc.validateInputs(input, '5').errors.price, 'Price must be a number.');
  }
  for (const input of ['abc', '2.5']) {
    assert.equal(Calc.validateInputs('5', input).errors.quantity, 'Quantity must be a whole number.');
  }
});

test('validateInputs: negative messages', () => {
  assert.equal(Calc.validateInputs('-1', '2').errors.price, 'Price cannot be negative.');
  assert.equal(Calc.validateInputs('5', '-1').errors.quantity, 'Quantity cannot be negative.');
});

test('validateInputs: too many decimals message', () => {
  assert.equal(Calc.validateInputs('1.234', '2').errors.price, 'Price can have at most 2 decimal places.');
});

test('validateInputs: too-large boundaries', () => {
  assert.equal(Calc.validateInputs('1000000.01', '1').errors.price, 'Price is too large.');
  assert.equal(Calc.validateInputs('5', '10001').errors.quantity, 'Quantity is too large.');

  const maxValid = Calc.validateInputs('1000000', '10000');
  assert.equal(maxValid.valid, true);
  assert.equal(maxValid.priceCents, 100000000);
  assert.equal(maxValid.quantity, 10000);

  const zeroValid = Calc.validateInputs('0', '0');
  assert.equal(zeroValid.valid, true);
  assert.equal(zeroValid.priceCents, 0);
  assert.equal(zeroValid.quantity, 0);
});

test('validateInputs: combined errors reported together', () => {
  const result = Calc.validateInputs('abc', '-2');
  assert.equal(result.valid, false);
  assert.equal(result.errors.price, 'Price must be a number.');
  assert.equal(result.errors.quantity, 'Quantity cannot be negative.');
});

test('validateInputs: valid happy path', () => {
  const result = Calc.validateInputs('19.99', '5');
  assert.equal(result.valid, true);
  assert.equal(result.priceCents, 1999);
  assert.equal(result.quantity, 5);
  assert.deepEqual(result.errors, {});
});
