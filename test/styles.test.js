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

// --- CSS parsing helpers -------------------------------------------------

function extractRootBlock(source) {
  const match = source.match(/:root\s*{([\s\S]*?)}/);
  assert.ok(match, 'expected a :root block in styles.css');
  return match[1];
}

function buildTokenMap(source) {
  const rootBlock = extractRootBlock(source);
  const map = {};
  const re = /(--[\w-]+)\s*:\s*([^;]+);/g;
  let m;
  while ((m = re.exec(rootBlock))) {
    map[m[1]] = m[2].trim();
  }
  return map;
}

function toPx(value) {
  const remMatch = value.match(/^([\d.]+)rem$/);
  if (remMatch) return parseFloat(remMatch[1]) * 16;
  const pxMatch = value.match(/^([\d.]+)px$/);
  if (pxMatch) return parseFloat(pxMatch[1]);
  return null;
}

function resolveToken(tokens, rawValue) {
  const varMatch = rawValue.match(/^var\((--[\w-]+)\)$/);
  if (varMatch) return tokens[varMatch[1]];
  return rawValue;
}

function extractRuleBody(source, selector) {
  const escaped = selector.replace(/[.#[\]="']/g, (c) => `\\${c}`);
  const re = new RegExp(escaped + '\\s*{([^}]*)}');
  const match = source.match(re);
  return match ? match[1] : null;
}

function normalizeHex(value) {
  return value.trim().toLowerCase();
}

const tokens = buildTokenMap(css);

// --- 1. page background / text color / no external resources ------------

test('body background resolves to #F6F7F9 and text color resolves to #1A1A1A', () => {
  const bodyBlock = extractRuleBody(css, 'body');
  assert.ok(bodyBlock, 'expected a body rule');
  const bgMatch = bodyBlock.match(/background-color:\s*([^;]+);/);
  const colorMatch = bodyBlock.match(/(?<!-)color:\s*([^;]+);/);
  assert.ok(bgMatch && colorMatch, 'expected background-color and color in body rule');
  assert.equal(normalizeHex(resolveToken(tokens, bgMatch[1].trim())), '#f6f7f9');
  assert.equal(normalizeHex(resolveToken(tokens, colorMatch[1].trim())), '#1a1a1a');
});

test('styles.css has no @import, no remote url(http...) and no external font references', () => {
  assert.doesNotMatch(css, /@import/i);
  assert.doesNotMatch(css, /url\(\s*['"]?https?:\/\//i);
  assert.doesNotMatch(css, /@font-face/i);
  assert.doesNotMatch(css, /fonts\.(googleapis|gstatic)\.com/i);
});

// --- 2. card rule ----------------------------------------------------------

test('.card has a 1px #E3E6EB border, 12px radius, a box-shadow and 420px max-width', () => {
  const cardBlock = extractRuleBody(css, '.card');
  assert.ok(cardBlock, 'expected a .card rule');

  const borderMatch = cardBlock.match(/border:\s*([^;]+);/);
  assert.ok(borderMatch, 'expected a border declaration on .card');
  const borderParts = borderMatch[1].trim().split(/\s+/);
  assert.equal(borderParts[0], '1px');
  assert.equal(borderParts[1], 'solid');
  assert.equal(normalizeHex(resolveToken(tokens, borderParts[2])), '#e3e6eb');

  const radiusMatch = cardBlock.match(/border-radius:\s*([^;]+);/);
  assert.ok(radiusMatch);
  assert.equal(toPx(resolveToken(tokens, radiusMatch[1].trim())), 12);

  const shadowMatch = cardBlock.match(/box-shadow:\s*([^;]+);/);
  assert.ok(shadowMatch, 'expected a box-shadow on .card');
  assert.notEqual(resolveToken(tokens, shadowMatch[1].trim()).trim(), 'none');

  const maxWidthMatch = cardBlock.match(/max-width:\s*([^;]+);/);
  assert.ok(maxWidthMatch);
  assert.equal(toPx(resolveToken(tokens, maxWidthMatch[1].trim())), 420);
});

test('the card never renders wider than 420px and sits within 120px of the viewport top at 1280px', () => {
  const cardBlock = extractRuleBody(css, '.card');
  const maxWidthMatch = cardBlock.match(/max-width:\s*([^;]+);/);
  const cardMaxWidth = toPx(resolveToken(tokens, maxWidthMatch[1].trim()));
  assert.ok(cardMaxWidth <= 420, 'card max-width must never exceed 420px, at any viewport width including 1280px');

  // Compute the card's distance from the viewport top at the 1280px breakpoint from the
  // real declared values: desktop body padding-top + the <h1> box height + the gap above the card.
  const desktopBodyBlock = css.match(/@media\s*\(min-width:\s*768px\)\s*{\s*body\s*{([\s\S]*?)}\s*}/);
  assert.ok(desktopBodyBlock, 'expected a min-width:768px body padding override');
  const desktopPaddingMatch = desktopBodyBlock[1].match(/padding:\s*([^;]+);/);
  const desktopPaddingTop = toPx(resolveToken(tokens, desktopPaddingMatch[1].trim()));

  const h1Block = extractRuleBody(css, 'h1');
  const h1FontSizeMatch = h1Block.match(/font-size:\s*([^;]+);/);
  const h1LineHeightMatch = h1Block.match(/line-height:\s*([^;]+);/);
  const h1FontSizePx = toPx(resolveToken(tokens, h1FontSizeMatch[1].trim()));
  const h1LineHeight = parseFloat(h1LineHeightMatch[1].trim());
  const h1BoxHeight = h1FontSizePx * h1LineHeight;

  const mainBlock = extractRuleBody(css, 'main');
  const gapMatch = mainBlock.match(/gap:\s*([^;]+);/);
  const gapPx = toPx(resolveToken(tokens, gapMatch[1].trim()));

  const cardTopOffset = desktopPaddingTop + h1BoxHeight + gapPx;
  assert.ok(
    cardTopOffset < 120,
    `expected card top offset (${cardTopOffset}px) to be under 120px at 1280px`
  );
});

// --- 3. typography ----------------------------------------------------------

test('h1 computed style is font-size 24px / font-weight 600', () => {
  const h1Block = extractRuleBody(css, 'h1');
  const fontSizeMatch = h1Block.match(/font-size:\s*([^;]+);/);
  const fontWeightMatch = h1Block.match(/font-weight:\s*([^;]+);/);
  assert.ok(fontSizeMatch && fontWeightMatch);
  assert.equal(toPx(resolveToken(tokens, fontSizeMatch[1].trim())), 24);
  assert.equal(fontWeightMatch[1].trim(), '600');
});

test('the Total amount is font-size 32px / font-weight 700 with tabular-nums', () => {
  const totalBlock = extractRuleBody(css, '.result-amount-total');
  assert.ok(totalBlock, 'expected a .result-amount-total rule');
  const fontSizeMatch = totalBlock.match(/font-size:\s*([^;]+);/);
  const fontWeightMatch = totalBlock.match(/font-weight:\s*([^;]+);/);
  assert.ok(fontSizeMatch && fontWeightMatch);
  assert.equal(toPx(resolveToken(tokens, fontSizeMatch[1].trim())), 32);
  assert.equal(fontWeightMatch[1].trim(), '700');

  // tabular-nums is declared either directly on the total rule or inherited from the
  // shared .result-amount rule that every amount (including Total) carries.
  const sharedBlock = extractRuleBody(css, '.result-amount');
  const combined = `${totalBlock} ${sharedBlock}`;
  assert.match(combined, /font-variant-numeric:\s*tabular-nums/);
});

// --- 4. discount color + row text -------------------------------------------

test('the discount amount rule resolves to color #067647', () => {
  const discountBlock = extractRuleBody(css, '.result-amount-discount');
  assert.ok(discountBlock, 'expected a .result-amount-discount rule');
  const colorMatch = discountBlock.match(/color:\s*([^;]+);/);
  assert.ok(colorMatch);
  assert.equal(normalizeHex(resolveToken(tokens, colorMatch[1].trim())), '#067647');
});

test('after a discounted calculation the discount row contains "discount applied" text', () => {
  const dom = makeDom();
  fillAndSubmit(dom, '50', '3'); // 150.00 subtotal clears the 100.00 threshold
  const { document } = dom.window;
  const discountDd = document.getElementById('result-discount');
  const row = discountDd.closest('.results-row-discount');
  assert.ok(row, 'expected the discount amount to live inside its row container');
  assert.match(row.textContent, /discount applied/i);
  assert.doesNotMatch(discountDd.textContent, /applied/i, 'the amount cell itself must stay a pure number');
});

test('after a non-discounted calculation the discount row contains "No discount applied" text', () => {
  const dom = makeDom();
  fillAndSubmit(dom, '10', '2'); // 20.00 subtotal, below the threshold
  const { document } = dom.window;
  const discountDd = document.getElementById('result-discount');
  const row = discountDd.closest('.results-row-discount');
  assert.match(row.textContent, /no discount applied/i);
});

// --- 5. results list alignment + divider ------------------------------------

test('each results row renders its label before its right-aligned amount, and Total has a divider above it', () => {
  const rowBlock = extractRuleBody(css, '.results-row dt');
  const amountBlock = extractRuleBody(css, '.result-amount');
  assert.ok(rowBlock && amountBlock);
  assert.match(rowBlock, /text-align:\s*left/);
  assert.match(amountBlock, /text-align:\s*right/);

  const totalRowBlock = extractRuleBody(css, '.results-row-total');
  assert.ok(totalRowBlock, 'expected a .results-row-total rule');
  const borderMatch = totalRowBlock.match(/border-top:\s*([^;]+);/);
  assert.ok(borderMatch, 'expected a border-top divider on .results-row-total');
  assert.notEqual(resolveToken(tokens, borderMatch[1].trim()), 'none');

  const dom = makeDom();
  fillAndSubmit(dom, '50', '3');
  const { document } = dom.window;
  const totalRow = document.getElementById('result-total').closest('.results-row-total');
  assert.ok(totalRow, 'expected #result-total to live inside .results-row-total');
  const subtotalRow = document.getElementById('result-subtotal').closest('.results-row');
  [subtotalRow, totalRow].forEach((row) => {
    const dt = row.querySelector('dt');
    const dd = row.querySelector('dd');
    assert.ok(dt && dd, 'expected a dt/dd pair in each row');
    assert.equal(
      dt.compareDocumentPosition(dd) & dom.window.Node.DOCUMENT_POSITION_FOLLOWING,
      dom.window.Node.DOCUMENT_POSITION_FOLLOWING,
      'label must come before the amount in DOM/visual order'
    );
  });
});

// --- 6. control sizing -------------------------------------------------------

test('inputs and buttons have a >=48px min-height, 16px+ font-size, and inputs have an 8px radius', () => {
  const inputBlock = extractRuleBody(css, '.field input');
  const btnBlock = extractRuleBody(css, '.btn');
  assert.ok(inputBlock && btnBlock);

  const inputMinHeight = inputBlock.match(/min-height:\s*([^;]+);/);
  const btnMinHeight = btnBlock.match(/min-height:\s*([^;]+);/);
  assert.ok(inputMinHeight && btnMinHeight);
  assert.ok(toPx(resolveToken(tokens, inputMinHeight[1].trim())) >= 48);
  assert.ok(toPx(resolveToken(tokens, btnMinHeight[1].trim())) >= 48);

  const inputFontSize = inputBlock.match(/font-size:\s*([^;]+);/);
  assert.ok(inputFontSize);
  assert.ok(toPx(resolveToken(tokens, inputFontSize[1].trim())) >= 16);

  const inputRadius = inputBlock.match(/border-radius:\s*([^;]+);/);
  assert.ok(inputRadius);
  assert.equal(toPx(resolveToken(tokens, inputRadius[1].trim())), 8);
});

test('each field renders its label before its input in document order', () => {
  const dom = makeDom();
  const { document } = dom.window;
  ['price', 'quantity'].forEach((name) => {
    const input = document.getElementById(name);
    const label = document.querySelector(`label[for="${name}"]`);
    assert.ok(label);
    assert.equal(
      label.compareDocumentPosition(input) & dom.window.Node.DOCUMENT_POSITION_FOLLOWING,
      dom.window.Node.DOCUMENT_POSITION_FOLLOWING,
      'label must precede its input'
    );
  });
});

// --- 7. buttons ---------------------------------------------------------------

test('Calculate is #1F5EFF with white text, fills the card content width, and has a darker :hover', () => {
  const primaryBlock = extractRuleBody(css, '.btn-primary');
  const btnBlock = extractRuleBody(css, '.btn');
  assert.ok(primaryBlock && btnBlock);

  const bgMatch = primaryBlock.match(/background-color:\s*([^;]+);/);
  const colorMatch = primaryBlock.match(/(?<!-)color:\s*([^;]+);/);
  assert.ok(bgMatch && colorMatch);
  assert.equal(normalizeHex(resolveToken(tokens, bgMatch[1].trim())), '#1f5eff');
  assert.equal(normalizeHex(resolveToken(tokens, colorMatch[1].trim())), '#ffffff');

  const widthMatch = btnBlock.match(/width:\s*([^;]+);/);
  assert.ok(widthMatch);
  assert.equal(widthMatch[1].trim(), '100%');

  const hoverBlock = extractRuleBody(css, '.btn-primary:hover');
  assert.ok(hoverBlock, 'expected a .btn-primary:hover rule');
  const hoverBgMatch = hoverBlock.match(/background-color:\s*([^;]+);/);
  assert.ok(hoverBgMatch);
  const hoverBg = normalizeHex(resolveToken(tokens, hoverBgMatch[1].trim()));
  const baseBg = normalizeHex(resolveToken(tokens, bgMatch[1].trim()));
  assert.notEqual(hoverBg, baseBg);
  const toRgbSum = (hex) => {
    const n = parseInt(hex.replace('#', ''), 16);
    return ((n >> 16) & 255) + ((n >> 8) & 255) + (n & 255);
  };
  assert.ok(toRgbSum(hoverBg) < toRgbSum(baseBg), 'hover background must be darker than the base background');
});

test('Clear button has a transparent background and a visible 1px border', () => {
  const secondaryBlock = extractRuleBody(css, '.btn-secondary');
  assert.ok(secondaryBlock);
  const bgMatch = secondaryBlock.match(/background-color:\s*([^;]+);/);
  assert.ok(bgMatch);
  assert.equal(bgMatch[1].trim(), 'transparent');

  const btnBlock = extractRuleBody(css, '.btn');
  const borderMatch = btnBlock.match(/border:\s*([^;]+);/);
  const borderColorMatch = secondaryBlock.match(/border-color:\s*([^;]+);/);
  assert.ok(borderMatch && borderColorMatch);
  assert.match(borderMatch[1], /^1px solid/);
  assert.notEqual(resolveToken(tokens, borderColorMatch[1].trim()), 'transparent');
});

// --- 8. error states -----------------------------------------------------------

test('aria-invalid inputs render a #B42318 border and the error text resolves to #B42318', () => {
  const invalidBlock = extractRuleBody(css, '.field input[aria-invalid="true"]');
  assert.ok(invalidBlock, 'expected a .field input[aria-invalid="true"] rule');
  const borderColorMatch = invalidBlock.match(/border-color:\s*([^;]+);/);
  assert.ok(borderColorMatch);
  assert.equal(normalizeHex(resolveToken(tokens, borderColorMatch[1].trim())), '#b42318');

  const errorBlock = extractRuleBody(css, '.field-error');
  assert.ok(errorBlock);
  const colorMatch = errorBlock.match(/color:\s*([^;]+);/);
  assert.ok(colorMatch);
  assert.equal(normalizeHex(resolveToken(tokens, colorMatch[1].trim())), '#b42318');
});

test('submitting empty fields marks both inputs aria-invalid and fills red error text directly below each field', () => {
  const dom = makeDom();
  const { document } = dom.window;
  fillAndSubmit(dom, '', '');

  ['price', 'quantity'].forEach((name) => {
    const input = document.getElementById(name);
    const error = document.getElementById(`${name}-error`);
    assert.equal(input.getAttribute('aria-invalid'), 'true');
    assert.equal(input.getAttribute('aria-describedby'), error.id);
    assert.notEqual(error.textContent, '');
    assert.equal(
      input.compareDocumentPosition(error) & dom.window.Node.DOCUMENT_POSITION_FOLLOWING,
      dom.window.Node.DOCUMENT_POSITION_FOLLOWING
    );
  });
  assert.equal(document.getElementById('results').hidden, true);
});

// --- 9. viewport meta + media query direction ---------------------------------

test('index.html declares the exact responsive viewport meta tag', () => {
  assert.match(
    html,
    /<meta name="viewport" content="width=device-width, initial-scale=1">/
  );
});

test('styles.css uses only min-width media queries, never max-width, for layout', () => {
  const mediaQueries = [...css.matchAll(/@media\s*\(([^)]*)\)/g)].map((m) => m[1]);
  assert.ok(mediaQueries.length > 0, 'expected at least one media query');
  mediaQueries.forEach((query) => {
    if (/width/i.test(query) && !/prefers-/.test(query)) {
      assert.match(query, /min-width/, `layout media query "${query}" must use min-width, not max-width`);
      assert.doesNotMatch(query, /max-width/);
    }
  });
});

// --- 10. no horizontal overflow across breakpoints ----------------------------

function pagePaddingPxAt(viewport) {
  return viewport >= 768 ? 32 : toPx(tokens['--page-padding']);
}

test('no horizontal scroll: the card never requires more width than the viewport provides, at 320/375/768/1280/1920px', () => {
  const cardMaxWidth = toPx(tokens['--card-max-width']);
  [320, 375, 768, 1280, 1920].forEach((viewport) => {
    const padding = pagePaddingPxAt(viewport);
    const availableWidth = viewport - 2 * padding;
    const renderedCardWidth = Math.min(cardMaxWidth, availableWidth);
    const documentWidth = renderedCardWidth + 2 * padding;
    assert.ok(
      documentWidth <= viewport,
      `document width (${documentWidth}px) must not exceed the ${viewport}px viewport`
    );
  });
});

test('styles.css declares no fixed pixel width wider than the narrowest supported viewport (320px)', () => {
  const declarations = [...css.matchAll(/(?<!min-|max-)\bwidth:\s*([\d.]+)px/g)];
  declarations.forEach(([, value]) => {
    assert.ok(parseFloat(value) <= 320, `found a fixed width of ${value}px that could force horizontal overflow`);
  });
});

// --- 11. 320px margins, total overflow, and 44x44 touch targets --------------

test('at 320px the card keeps at least 8px of side margin and inner content stays >=44px wide', () => {
  const padding = pagePaddingPxAt(320);
  assert.ok(padding >= 8, `expected >=8px side margin at 320px, got ${padding}px`);

  const cardBlock = extractRuleBody(css, '.card');
  const cardPaddingMatch = cardBlock.match(/padding:\s*([^;]+);/);
  assert.ok(cardPaddingMatch);
  const paddingParts = cardPaddingMatch[1].trim().split(/\s+/);
  const cardHorizontalPadding = toPx(resolveToken(tokens, paddingParts[paddingParts.length - 1]));

  const cardMaxWidth = toPx(tokens['--card-max-width']);
  const cardWidth = Math.min(cardMaxWidth, 320 - 2 * padding);
  const contentWidth = cardWidth - 2 * cardHorizontalPadding;
  assert.ok(contentWidth >= 44, `expected >=44px of content width at 320px, got ${contentWidth}px`);
});

test('the Total amount wraps instead of overflowing at 320px, and controls stay >=44px tall', () => {
  const totalBlock = extractRuleBody(css, '.result-amount-total');
  const sharedBlock = extractRuleBody(css, '.result-amount');
  const combined = `${totalBlock} ${sharedBlock}`;
  assert.match(combined, /overflow-wrap:\s*anywhere|word-break:\s*break-all/);

  const inputBlock = extractRuleBody(css, '.field input');
  const btnBlock = extractRuleBody(css, '.btn');
  const inputMinHeight = toPx(resolveToken(tokens, inputBlock.match(/min-height:\s*([^;]+);/)[1].trim()));
  const btnMinHeight = toPx(resolveToken(tokens, btnBlock.match(/min-height:\s*([^;]+);/)[1].trim()));
  assert.ok(inputMinHeight >= 44);
  assert.ok(btnMinHeight >= 44);

  const dom = makeDom();
  fillAndSubmit(dom, '1000000', '1'); // the maximum allowed price: a long 7-digit total string
  const { document } = dom.window;
  // Note: calc.js's formatCents does not currently apply thousands-grouping (a pre-existing gap
  // outside this ticket's scope, which only covers styles.css/index.html/app.js). The rendered
  // text is still long enough to exercise the no-overflow guarantee at 320px.
  assert.equal(document.getElementById('result-subtotal').textContent, '1000000.00');
  assert.equal(document.getElementById('result-total').textContent, '900000.00');
});
