module.exports = (function() {
  var express = require('express');

  var bodyParser = require('body-parser');
  var cookieParser = require('cookie-parser');
  var fs = require('fs');
  var logger = require('morgan');
  var nunjucks = require('nunjucks');
  var path = require('path');

  var app = express();

  var contentDir = 'data';
  var viewLoader = new nunjucks.FileSystemLoader(contentDir);
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

  app.use(bodyParser.urlencoded({
    extended: false,
  }));
  app.use(cookieParser());

  app.use(restrictAccess);
  ASSET_DIRECTORIES.forEach(function(dir) {
    app.use('/' + dir, express.static(path.join(__dirname, dir)));
  });
  app.post('/login', checkPassword);
  app.get(/^\/(.*)$/, displayPage);
  app.use(fallbackHandler);
  app.use(errorHandler);

  function checkPassword(req, res, next) {
    fs.readFile(contentDir + '/password.txt', {
        encoding: 'utf8',
      },
      function(err, password) {
        if (err) {
          next(err);
          return;
        }

        if (req.body.password !== password) {
          res.status(404);
          res.render('error.html', {
            message: 'Falsches Passwort! <a href="/login">Nochmal?</a>',
          });
          return;
        }

        var domain;
        var httpsOnly;
        if (app.get('env') == 'production') {
          domain = 'uptime.regulus.uberspace.de';
          httpsOnly = true;
        } else {
          domain = '.node.js';
          httpsOnly = false;
        }

        var oneYearInMilliseconds = 365 * 24 * 60 * 60 * 1000;
        res.cookie('rememberremember', 'the third of July', {
          domain: domain,
          secure: httpsOnly,
          maxAge: oneYearInMilliseconds,
        });
        res.redirect('/info');
      });
  }

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
      isLoggedIn: isLoggedIn(req),
    });
  }

  function errorHandler(err, req, res, next) {
    console.error(err.stack);

    res.status(404);
    res.render('error.html', {
      isLoggedIn: isLoggedIn(req),
    });
  }

  function fallbackHandler(req, res, next) {
    var err = new Error('Not Found');
    err.status = 404;
    next(err);
  }

  function restrictAccess(req, res, next) {
    var unrestrictedUrls = [
      '/css/bootstrap.min.css',
      '/login',
    ];

    var isUnrestricted = unrestrictedUrls.indexOf(req.url) > -1;
    if (isUnrestricted || isLoggedIn(req)) {
      next();
      return;
    }

    res.redirect('/login');
  }

  function isLoggedIn(req) {
    return (req.cookies.rememberremember === 'the third of July');
  }

  return app;
})();
