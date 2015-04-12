module.exports = (function() {
  var express = require('express');

  var fs = require('fs');
  var logger = require('morgan');
  var nunjucks = require('nunjucks');
  var path = require('path');

  var app = express();

  var views = 'data';
  var viewLoader = new nunjucks.FileSystemLoader(views);
  var viewEnv = new nunjucks.Environment(viewLoader, {autoescape: true});
  viewEnv.express(app);

  if (app.get('env') === 'production') {
    app.use(logger('short'));
  } else {
    app.use(logger('dev'));
  }

  var ASSET_DIRECTORIES = ['css',
    'fonts',
    'js',
  ];

  ASSET_DIRECTORIES.forEach(function(dir) {
    app.use('/' + dir, express.static(path.join(__dirname, dir)));
  });

  app.get(/^\/(.*)$/, displayPage);
  app.use(fallbackHandler);
  app.use(errorHandler);

  function displayPage(req, res, next) {
    var pageName = req.params[0].replace(/\/$/, '');

    // default to info page
    if (pageName === '') {
      pageName = 'info';
    }

    // do not handle requests with file extension
    if (pageName.indexOf('.') > -1) {
      return;
    }

    var fileName = pageName + '.html';

    if (fileName !== path.normalize(fileName)) {
      return;
    }

    res.render(fileName, {
      activePage: pageName.split('/')[0],
    });
  }

  function fallbackHandler(req, res, next) {
    var err = new Error('Not Found');
    err.status = 404;
    next(err);
  }

  function errorHandler(err, req, res, next) {
    console.error(err.stack);

    res.status(404);
    res.render('error.html', {});
  }

  return app;
})();
