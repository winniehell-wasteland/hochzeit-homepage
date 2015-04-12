#!/usr/bin/env node

var app = require('./app');
var config = require('./package.json');

var port = parseInt(process.env.PORT);

if (port) {
  console.log('Listening at port ' + port);
  app.listen(port);
} else {
  var hostname = config.name + '.node.js';
  port = 62000;
  console.log('Listening at http://' + hostname + ':' + port + ' ...');
  app.listen(port, hostname);
}
