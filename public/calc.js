(function (root, factory) {
  'use strict';
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.Calc = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const CONSTANTS = Object.freeze({});

  return { CONSTANTS };
}));
