'use strict';

function init() {
  const Calc = (typeof window !== 'undefined' && window.Calc)
    || (typeof global !== 'undefined' && global.Calc);
  const form = document.getElementById('calc-form');
  const clearButton = document.getElementById('clear');
  const priceInput = document.getElementById('price');
  const quantityInput = document.getElementById('quantity');
  const priceError = document.getElementById('price-error');
  const quantityError = document.getElementById('quantity-error');
  const results = document.getElementById('results');
  const subtotalEl = document.getElementById('result-subtotal');
  const discountEl = document.getElementById('result-discount');
  const totalEl = document.getElementById('result-total');
  const noteEl = document.getElementById('discount-note');
  const savingsEl = document.getElementById('savings');
  const hintEl = document.getElementById('threshold-hint');

  if (!form || !Calc) {
    return;
  }

  const fields = {
    price: { input: priceInput, error: priceError },
    quantity: { input: quantityInput, error: quantityError }
  };

  function clearFieldState(name) {
    const field = fields[name];
    field.error.textContent = '';
    field.input.removeAttribute('aria-invalid');
    field.input.removeAttribute('aria-describedby');
  }

  function clearErrors() {
    Object.keys(fields).forEach(clearFieldState);
  }

  function setFieldError(name, message) {
    const field = fields[name];
    field.error.textContent = '⚠ ' + message;
    field.input.setAttribute('aria-invalid', 'true');
    field.input.setAttribute('aria-describedby', field.error.id);
  }

  function clearResults() {
    results.hidden = true;
    subtotalEl.textContent = '';
    discountEl.textContent = '';
    totalEl.textContent = '';
    noteEl.textContent = '';
    savingsEl.textContent = '';
    savingsEl.hidden = true;
    hintEl.textContent = '';
    hintEl.hidden = true;
  }

  function showResults(subtotalCents, discountCents, totalCents) {
    const groupOpts = { grouped: true };
    subtotalEl.textContent = Calc.formatCents(subtotalCents, groupOpts);
    discountEl.textContent = Calc.formatCents(discountCents, groupOpts);
    totalEl.textContent = Calc.formatCents(totalCents, groupOpts);
    noteEl.textContent = discountCents > 0 ? '10% discount applied' : 'No discount applied';

    if (discountCents > 0) {
      savingsEl.textContent = 'You saved ' + Calc.formatCents(discountCents, groupOpts);
      savingsEl.hidden = false;
      hintEl.textContent = '';
      hintEl.hidden = true;
    } else {
      const remainingCents = Calc.remainingToThresholdCents(subtotalCents);
      hintEl.textContent = 'Add ' + Calc.formatCents(remainingCents, groupOpts) + ' more to get 10% off';
      hintEl.hidden = false;
      savingsEl.textContent = '';
      savingsEl.hidden = true;
    }

    results.hidden = false;
  }

  function handleSubmit(event) {
    event.preventDefault();

    const validation = Calc.validateInputs(priceInput.value, quantityInput.value);

    if (!validation.valid) {
      clearResults();
      Object.keys(fields).forEach((name) => {
        if (validation.errors[name]) {
          setFieldError(name, validation.errors[name]);
        } else {
          clearFieldState(name);
        }
      });
      const firstInvalid = ['price', 'quantity'].find((name) => validation.errors[name]);
      if (firstInvalid) {
        fields[firstInvalid].input.focus();
      }
      return;
    }

    clearErrors();

    const { subtotalCents, discountCents, totalCents } = Calc.calculate(validation.priceCents, validation.quantity);
    showResults(subtotalCents, discountCents, totalCents);
  }

  function handleClear() {
    priceInput.value = '';
    quantityInput.value = '';
    clearErrors();
    clearResults();
    priceInput.focus();
  }

  form.addEventListener('submit', handleSubmit);
  if (clearButton) {
    clearButton.addEventListener('click', handleClear);
  }
}

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', init);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { init };
}
