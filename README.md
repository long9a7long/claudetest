# claudetest

A small cart calculator: Node.js + Express serves a static, framework-free front end from `public/`.

## Run

```
npm install
npm start
```

Listens on `process.env.PORT` or `4173` by default. Override with `PORT=5050 npm start`.

## Test

```
npm test
```

Runs the `node:test` suite in `test/`. `server.js` exports `{ app, start }`; tests can `require('./server.js')`, call `start(0)` to bind an ephemeral port, and close the returned server when done.

## Accessibility verification

### Automated checks (2026-11-17)

`test/accessibility.test.js` (run as part of `npm test`) statically verifies, against the live source files:

- `index.html` has `<html lang="en">`, a non-empty `<title>`, exactly one `<main>`, exactly one `<h1>`, a `<form>`, and every `<input>` has a `<label for>` matching its `id`.
- No element has `tabindex` greater than `0`, and the DOM order is Price, Quantity, Calculate, Clear (the natural, un-trapped tab order).
- `styles.css` defines an `input:focus-visible, button:focus-visible` rule with `outline: 2px solid var(--color-focus-ring)` (`#1F5EFF`) and `outline-offset: 2px`, and no interactive selector removes the outline without a replacement indicator.
- A `@media (prefers-reduced-motion: reduce)` block sets `transition: none` and `animation: none`.
- A WCAG relative-luminance helper computes contrast ratios ≥ 4.5:1 for `#1A1A1A` on `#F6F7F9`, `#5B6470` on white and on `#F6F7F9`, `#B42318` on white, `#067647` on white, and white on `#1F5EFF`.
- Pressing Enter in Price or Quantity submits the form natively (Calculate is `type="submit"`) and runs the calculation; a failed submit moves focus to the first invalid field with `aria-invalid`/`aria-describedby` set; Clear resets the form, clears errors/results, and returns focus to Price.

### Keyboard walkthrough (measured 2026-11-17)

Run against the live app (`npm start` on `http://localhost:4173/`) in headless Chromium 156.0.8078.79, driven with `puppeteer-core` sending real `Tab`/`Enter` key events (not synthetic DOM events) and reading `document.activeElement` after each step:

| Step | Result |
| --- | --- |
| Tab order: Price → Quantity → Calculate → Clear, no trap | PASS — focus moved `price` → `quantity` → Calculate → Clear in order |
| Enter in Price or Quantity triggers Calculate | PASS — focusing Price and pressing Enter (price=50, quantity=2) produced total `90.00` and revealed the results panel |
| Clear (failed submit) focuses the first invalid field | PASS — submitting with both fields empty left focus on `#price` with `aria-invalid="true"` |
| Clear returns focus to Price | PASS — activating Clear reset the inputs, hid the results panel, and moved focus to `#price` |

The same four behaviors are additionally covered by deterministic jsdom tests in `test/accessibility.test.js`, which run on every `npm test`.

### Lighthouse (measured 2026-11-17)

Ran with Chromium 156.0.8078.79 installed via `apt-get install chromium`, against the app served by `npm start` on `http://localhost:4173/`:

```
npm start
CHROME_PATH=/usr/bin/chromium npx lighthouse http://localhost:4173/ \
  --only-categories=accessibility,performance \
  --output=json --output-path=./lighthouse-report.json \
  --chrome-flags="--headless=new --no-sandbox --disable-gpu"
```

Lighthouse's default config targets the mobile form factor with simulated throttling (RTT 150 ms, ~1.6 Mbps throughput, 4x CPU slowdown) — its standard approximation of a Fast 3G / slow 4G connection. Two consecutive runs:

| Run | Accessibility | Performance | First Contentful Paint |
| --- | --- | --- | --- |
| 1 | 100 | 100 | 0.9 s |
| 2 | 100 | 100 | 1.0 s |

No failing `color-contrast`, `label`, `html-has-lang`, or `landmark-one-main` audits in either run (each scored 1/1, binary scoring mode). FCP stayed at or under 1.0 s, within the 1.5 s budget.
