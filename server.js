'use strict';

const express = require('express');
const path = require('path');

const app = express();

app.disable('x-powered-by');

app.use((req, res, next) => {
  res.setHeader('Content-Security-Policy', "default-src 'self'");
  next();
});

app.use(express.static(path.join(__dirname, 'public'), {
  dotfiles: 'ignore',
  index: 'index.html',
}));

app.use((req, res) => {
  res.status(404).type('text/plain').send('Not Found');
});

function start(port) {
  const listenPort = port === undefined
    ? (Number(process.env.PORT) || 4173)
    : port;
  const server = app.listen(listenPort, () => {
    console.log(`Server listening on port ${server.address().port}`);
  });
  return server;
}

if (require.main === module) {
  start();
}

module.exports = { app, start };
