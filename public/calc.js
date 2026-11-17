(function (root, factory) {
  'use strict';
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.Calc = factory();
  }
}(typeof self !== 'undefined' ? self : typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const CONSTANTS = Object.freeze({
    DISCOUNT_RATE: 0.1,
    DISCOUNT_THRESHOLD_CENTS: 10000,
    MAX_PRICE: 1000000,
    MAX_QUANTITY: 10000
  });

  const PRICE_PATTERN = /^-?(\d+(\.\d*)?|\.\d+)$/;
  const QUANTITY_PATTERN = /^-?\d+$/;

  // Integer-cent conversion by string splitting; never multiply floats by 100.
  function toCents(numericStr) {
    const negative = numericStr.charAt(0) === '-';
    const unsigned = negative ? numericStr.slice(1) : numericStr;
    const parts = unsigned.split('.');
    const intPart = parts[0] === '' ? '0' : parts[0];
    let fracPart = parts.length > 1 ? parts[1] : '';
    if (fracPart.length > 2) {
      return { tooManyDecimals: true };
    }
    while (fracPart.length < 2) {
      fracPart += '0';
    }
    const cents = parseInt(intPart, 10) * 100 + parseInt(fracPart, 10);
    return { cents: negative ? -cents : cents };
  }

  function parsePriceToCents(input) {
    const str = input === null || input === undefined ? '' : String(input).trim();
    if (str === '') {
      return { ok: false, reason: 'empty' };
    }
    if (!PRICE_PATTERN.test(str)) {
      return { ok: false, reason: 'non-numeric' };
    }
    if (str.charAt(0) === '-') {
      return { ok: false, reason: 'negative' };
    }
    const result = toCents(str);
    if (result.tooManyDecimals) {
      return { ok: false, reason: 'too-many-decimals' };
    }
    return { ok: true, value: result.cents };
  }

  function parseQuantity(input) {
    const str = input === null || input === undefined ? '' : String(input).trim();
    if (str === '') {
      return { ok: false, reason: 'empty' };
    }
    if (!QUANTITY_PATTERN.test(str)) {
      return { ok: false, reason: 'non-numeric' };
    }
    if (str.charAt(0) === '-') {
      return { ok: false, reason: 'negative' };
    }
    return { ok: true, value: parseInt(str, 10) };
  }

  function validateInputs(priceStr, quantityStr) {
    const errors = {};
    let priceCents;
    let quantity;

    const priceResult = parsePriceToCents(priceStr);
    if (!priceResult.ok) {
      if (priceResult.reason === 'empty') {
        errors.price = 'Enter a price.';
      } else if (priceResult.reason === 'non-numeric') {
        errors.price = 'Price must be a number.';
      } else if (priceResult.reason === 'negative') {
        errors.price = 'Price cannot be negative.';
      } else if (priceResult.reason === 'too-many-decimals') {
        errors.price = 'Price can have at most 2 decimal places.';
      }
    } else if (priceResult.value > CONSTANTS.MAX_PRICE * 100) {
      errors.price = 'Price is too large.';
    } else {
      priceCents = priceResult.value;
    }

    const quantityResult = parseQuantity(quantityStr);
    if (!quantityResult.ok) {
      if (quantityResult.reason === 'empty') {
        errors.quantity = 'Enter a quantity.';
      } else if (quantityResult.reason === 'non-numeric') {
        errors.quantity = 'Quantity must be a whole number.';
      } else if (quantityResult.reason === 'negative') {
        errors.quantity = 'Quantity cannot be negative.';
      }
    } else if (quantityResult.value > CONSTANTS.MAX_QUANTITY) {
      errors.quantity = 'Quantity is too large.';
    } else {
      quantity = quantityResult.value;
    }

    if (Object.keys(errors).length > 0) {
      return { valid: false, errors };
    }

    return { valid: true, errors: {}, priceCents, quantity };
  }

  const api = Object.freeze({
    CONSTANTS,
    DISCOUNT_RATE: CONSTANTS.DISCOUNT_RATE,
    DISCOUNT_THRESHOLD_CENTS: CONSTANTS.DISCOUNT_THRESHOLD_CENTS,
    MAX_PRICE: CONSTANTS.MAX_PRICE,
    MAX_QUANTITY: CONSTANTS.MAX_QUANTITY,
    parsePriceToCents,
    parseQuantity,
    validateInputs
  });

  return api;
}));
