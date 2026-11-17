# TestClaudeQA

A small cart calculator: Node.js + Express serves a static, framework-free front end from `public/`. Price and Quantity go into a pure UMD module (`public/calc.js`) that returns totals, discount, and savings, or per-field validation messages. This file holds project-level rules. Task details come from the ticket you are given.

## Tech Stack (do not add to it)

- **Runtime:** Node.js with Express. `express` is the **only** runtime dependency.
- **Server:** `server.js` at the repo root. It exports `{ app, start }`, reads the port from `process.env.PORT` (default `4173`), and serves **only** `public/`.
- **Front end:** Vanilla HTML5, CSS3, and browser JavaScript using the DOM API. No frameworks, no bundlers, no transpilers, no CDNs, no `@import`, no external or web fonts.
- **Shared logic:** `public/calc.js` is a UMD module. It attaches to `window.Calc` in the browser and uses `module.exports` in Node and tests.
- **Tests:** built-in `node:test` and `node:assert`. `jsdom` is allowed as a **devDependency only**, for DOM tests. Do not add other test runners or libraries (no Jest, Mocha, Playwright, etc.).
- Do not add any dependency without an explicit ticket requirement. If a task seems to need one, solve it with the platform first.

## Repository Layout

```
server.js            Express app; exports { app, start }
package.json         scripts: start, test; express is the only dependency
public/
  index.html         semantic app shell (single page)
  styles.css         hand-written CSS, token-driven
  app.js             DOM wiring; consumes window.Calc
  calc.js            pure UMD logic (no DOM, no I/O)
test/                node:test suites (server, calc, UI/jsdom, contrast)
README.md            run instructions plus accessibility/Lighthouse verification notes
```

Keep to this layout. Do not put files outside `public/` that the server should expose, and do not serve the repo root.

## Commands

- Install: `npm install`
- Run: `npm start` (listens on `PORT` or `4173`)
- Test: `npm test` (runs `node --test`). Run it before declaring any task done, and report failures honestly with their output.

Keep `package.json` scripts working. If you add a test file, make sure `npm test` picks it up.

## Architecture Rules

### Server (`server.js`)
- Export `{ app, start }`. Importing the module must **not** start listening. Only `start()` (or direct `node server.js` execution) binds the port.
- `start(port)` honors an explicit port, then `process.env.PORT`, then `4173`. It must return something tests can close (the `http.Server` or a promise of it).
- Serve static files from `public/` only. Unknown paths return a 404 response.
- Send security headers on every response (for example `X-Content-Type-Options: nosniff`, a restrictive `Content-Security-Policy` that allows only same-origin assets, `Referrer-Policy`, `X-Frame-Options`/`frame-ancestors`). Disable `X-Powered-By`. Never set cookies or sessions.
- Do not add middleware packages (no helmet, cors, compression, etc.). Set headers by hand.
- Because CSP restricts to same origin, **no inline `<script>`, no inline event handlers, no inline `style` attributes**. Put code in `app.js` and styles in `styles.css`.

### `calc.js`
- Pure and dependency-free. No DOM access, no `fetch`, no `Date`/randomness, no globals except the UMD attachment.
- Business constants are exposed as a **frozen** object (`Object.freeze`). Never hardcode those values elsewhere. Read them from `Calc`.
- **Money is integer cents.** Convert at the boundary, do all arithmetic in integers, and convert back only for formatting. Never accumulate floats.
- The discount is 10%, rounded **half-up** in cents. Test the rounding edges.
- Parsing is **strict**: reject empty strings, whitespace-only values, non-numeric text, `NaN`, `Infinity`, exponents or hex if the spec forbids them, and out-of-range values. Do not use lenient `parseFloat` or `Number()` coercion on its own.
- Validation returns per-field message strings. Keep the exact wording stable, since UI tests assert on it. Change a message only if the ticket says so.
- Formatting always yields exactly 2 decimals. Thousands grouping (for example `1,234.50`) is done in the shared formatter in `calc.js`, not ad hoc in the UI. Do not rely on locale-dependent `toLocaleString` unless the output is pinned and tested.

### `app.js` (UI wiring)
- Vanilla DOM only. Look up elements by `id`. Use `textContent`, never `innerHTML` with user-derived data.
- The form uses `novalidate`. All validation goes through `Calc`. Do not duplicate parsing or math in the UI.
- Invalid input **clears stale results** so an old total is never shown beside an error.
- Keep DOM wiring testable under jsdom. Initialize on `DOMContentLoaded` or an exported init function, and do not depend on a real browser layout.

## Design & UI Conventions

Every UI change follows one visual language. Never ship unstyled default controls, and never introduce a second look.

### Tokens (single source of truth)
- All design values are CSS custom properties on `:root` in `public/styles.css`: colors, spacing scale, type scale, radius, font stack. Component rules use `var(--...)` and **never hardcode** hex values, pixel spacing, or font names outside the token block.
- **Spacing scale** is a 4px-based set of tokens (for example `--space-1: 0.25rem`, `--space-2: 0.5rem`, `--space-3: 0.75rem`, `--space-4: 1rem`, `--space-6: 1.5rem`, `--space-8: 2rem`). Use only these. Label→input→error spacing is consistent across all fields.
- **Typography:** system font stack only (`system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`). A clear hierarchy: one `h1`, label and body at about 1rem, helper and secondary text at about 0.875rem, and the total shown larger and heavier. Line-height about 1.5 for body text.
- **Color:** a restrained neutral palette plus **one** accent (primary button, focus ring, links). Dedicated semantic tokens: a **red error** tone (invalid borders and messages), and a distinct **positive/green** tone for savings text. Do not use color alone to convey state. Pair it with text, such as an error message or an "invalid" border plus text.
- **Shape:** one radius token. The card is a flat container (border, no heavy shadow). Use a shadow token only if one already exists and the ticket asks for it.

### Layout
- **Mobile-first**, single column, written as base styles with `min-width` media queries for larger screens.
- One **centered card** on a neutral page background: fluid width with a `max-width`, centered with auto margins, and padded using spacing tokens.
- Vertical form stack: label, input, error text for each field, then the Calculate (primary, filled accent) and Clear (secondary, outlined) buttons, then the results panel beneath.
- Results region: the total is the primary line. The savings line (positive tone) and the threshold hint are secondary lines beneath it. Results are a list or grouped lines, not a table.
- **No horizontal scroll** at any viewport width (test mentally at 320px). Use `box-sizing: border-box`, fluid widths, and `min-width: 0` where needed. Inputs are `width: 100%`.
- `<meta name="viewport" content="width=device-width, initial-scale=1">`, `<html lang="en">`, and a single `<main>` landmark.

### Dark mode
- Dark theme is **automatic only**: a `@media (prefers-color-scheme: dark)` block that overrides the **same color tokens** on `:root`. No JS toggle, no `localStorage`, no extra classes.
- Dark palette uses muted dark surfaces with light text. Layout, spacing, and typography stay identical between themes.
- Any new color token must be defined for **both** light and dark.

### Accessibility bar (non-negotiable)
- **WCAG 2.1 AA:** text contrast at least 4.5:1 (large text 3:1; UI component boundaries and focus rings 3:1) in **both** themes. Contrast is enforced by an automated `node:test` that parses tokens from `styles.css` and computes ratios. Update it when you add or change color tokens.
- Every input has a visible `<label>` bound with `for`/`id`. Do not use placeholders as labels.
- Errors: set `aria-invalid="true"` on the invalid input and link it with `aria-describedby` to its error container. Remove both when the field becomes valid. Error containers have stable ids.
- Results region uses `aria-live="polite"`. Update its text content so changes are announced, and do not rebuild the whole region needlessly.
- **Focus management:** on failed submit, move focus to the **first invalid field**. On Clear, reset the form, clear errors and results, and focus the **Price** field.
- **Visible focus** rings on every interactive element, using `:focus-visible` and an accent-based outline with offset. Never `outline: none` without a replacement.
- Fully keyboard operable. Use native `<button>` and `<input>` elements, and a logical tab order matching the visual order.
- Honor `@media (prefers-reduced-motion: reduce)`. Keep any transitions minimal and disable them there.
- Touch targets are at least 44px tall for buttons and inputs.

## Testing Conventions

- Framework: `node:test` with `node:assert/strict`. Test files live in `test/` and are named `*.test.js`.
- **Server tests:** import `{ app, start }`, start on port `0` or an ephemeral port, and always close the server in `after`/`finally`. Cover port handling (`PORT` env and default 4173), fast startup, static serving of `public/` files, security headers, 404 for unknown paths, and no `Set-Cookie`. Use Node's built-in `fetch` or `http`. Never hard-bind a fixed port that could collide.
- **calc tests:** table-driven. Cover boundaries, half-up rounding cases, strict-parse rejections, exact validation messages, and 2-decimal and grouped formatting.
- **UI tests:** jsdom loads `public/index.html`, evaluates `calc.js` and `app.js`, and drives the DOM through events. Assert on text, `aria-*` attributes, focus (`document.activeElement`), and that results clear on invalid input.
- **Contrast test:** compute WCAG ratios from the actual custom properties in `styles.css` for both light and dark.
- Tests must be deterministic: no network beyond localhost, no sleeps used for correctness, and no reliance on wall-clock timing beyond a generous startup bound.
- When you change behavior, update or add tests in the same change. Never weaken or delete a test to make it pass. Fix the code, or flag a genuine spec conflict.

## Code Style

- CommonJS on the Node side (`require`/`module.exports`). Browser files are plain scripts, not ES modules, and `calc.js` uses the UMD wrapper.
- 2-space indent, semicolons, single quotes in JS, `const`/`let` only, and strict equality. Add `'use strict'` in browser scripts and the UMD factory.
- Small, named functions. Comment only the non-obvious (rounding, strict-parse rules, a11y reasoning).
- CSS: class-based selectors, no `!important`, no ID selectors for styling, and a flat structure ordered as tokens, base, layout, components, states, media queries.
- HTML: semantic elements, lowercase, double-quoted attributes, and no inline styles or scripts.

## README

`README.md` documents how to run and test, and records accessibility verification: Lighthouse scores for accessibility and performance (with date and how it was run), the keyboard-only walkthrough result, and the contrast approach. Update it when you change those facts. Do not fabricate scores. Record only what you actually measured, or state that it has not been run.

## Working Agreements

- Stay in scope. Implement the ticket you were given. Do not refactor unrelated files or add speculative features.
- Build on what exists. Read `public/`, `server.js`, and `test/` before editing, and reuse existing tokens, ids, class names, and helpers instead of creating parallel ones.
- Keep ids and public `Calc` API names stable across tasks. Later tickets and tests depend on them. If you must change one, update every consumer and test.
- No network calls from the front end, no analytics, no third-party assets.
- Do not commit secrets or `node_modules`. Keep `.gitignore` covering `node_modules/`.
- Before finishing, run `npm test`, confirm the server starts with `npm start`, and summarize what changed and what you verified. State plainly anything you could not verify.
