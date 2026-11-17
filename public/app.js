'use strict';

function init() {
  // DOM wiring is implemented in a later ticket.
}

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', init);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { init };
}
