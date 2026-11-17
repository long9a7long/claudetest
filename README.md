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

Not yet run — Lighthouse scores, keyboard-only walkthrough, and contrast verification will be recorded here once the UI has interactive features to test.
