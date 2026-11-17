'use strict';

const express = require('express');
const path = require('path');

const app = express();

app.use(express.static(path.join(__dirname, 'public')));

function start(port) {
  const listenPort = port || process.env.PORT || 4173;
  const server = app.listen(listenPort, () => {
    console.log(`Server listening on port ${server.address().port}`);
  });
  return server;
}

if (require.main === module) {
  start();
}

module.exports = { app, start };
