'use strict';

function init() {
  const Calc = (typeof window !== 'undefined' && window.Calc)
    || (typeof global !== 'undefined' && global.Calc);
  const form = document.getElementById('calc-form');
  const priceInput = document.getElementById('price');
  const quantityInput = document.getElementById('quantity');
  const priceError = document.getElementById('price-error');
  const quantityError = document.getElementById('quantity-error');
  const results = document.getElementById('results');
  const subtotalEl = document.getElementById('result-subtotal');
  const discountEl = document.getElementById('result-discount');
  const totalEl = document.getElementById('result-total');
  const noteEl = document.getElementById('discount-note');

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

  function setFieldError(name, message) {
    const field = fields[name];
    field.error.textContent = message;
    field.input.setAttribute('aria-invalid', 'true');
    field.input.setAttribute('aria-describedby', field.error.id);
  }

  function hideResults() {
    results.hidden = true;
    subtotalEl.textContent = '';
    discountEl.textContent = '';
    totalEl.textContent = '';
    noteEl.textContent = '';
  }

  function showResults(subtotalCents, discountCents, totalCents) {
    subtotalEl.textContent = Calc.formatCents(subtotalCents);
    discountEl.textContent = Calc.formatCents(discountCents);
    totalEl.textContent = Calc.formatCents(totalCents);
    noteEl.textContent = discountCents > 0 ? '10% discount applied' : 'No discount applied';
    results.hidden = false;
  }

  function handleSubmit(event) {
    event.preventDefault();

    const validation = Calc.validateInputs(priceInput.value, quantityInput.value);

    if (!validation.valid) {
      hideResults();
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

    clearFieldState('price');
    clearFieldState('quantity');

    const { subtotalCents, discountCents, totalCents } = Calc.calculate(validation.priceCents, validation.quantity);
    showResults(subtotalCents, discountCents, totalCents);
  }

  form.addEventListener('submit', handleSubmit);
}

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', init);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { init };
}
