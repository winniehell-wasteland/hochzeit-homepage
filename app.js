module.exports = (function() {
  var express = require('express');

  var bodyParser = require('body-parser');
  var cookieParser = require('cookie-parser');
  var fs = require('fs');
  var logger = require('morgan');
  var nunjucks = require('nunjucks');
  var path = require('path');

  var app = express();

  var CONTENT_DIR = 'data';
  var PASSWORD = fs.readFileSync(CONTENT_DIR + '/password.txt', {
    encoding: 'utf8',
  });

  var viewLoader = new nunjucks.FileSystemLoader(CONTENT_DIR);
  var viewEnv = new nunjucks.Environment(viewLoader, {autoescape: true});
  viewEnv.express(app);

  if (app.get('env') === 'production') {
    app.use(logger('short'));
  } else {
    app.use(logger('dev'));
  }

  app.use(bodyParser.urlencoded({
    extended: false,
  }));
  app.use(cookieParser());

  app.use(restrictAccess);
  app.post('/login', checkPassword);

  addAssetHandler(__dirname, ['css',
    'fonts',
    'js',
  ]);
  addAssetHandler(CONTENT_DIR, ['photos',
  ]);

  app.get(/^\/(.*)$/, displayPage);
  app.use(fallbackHandler);
  app.use(errorHandler);

  function addAssetHandler(baseDir, subDirs) {
    subDirs.forEach(function (subDir) {
      app.use('/' + subDir, express.static(path.join(baseDir, subDir), {
        index: false,
        maxAge: '1 days',
      }));
    });
  }

  function checkPassword(req, res, next) {
        if (req.body.password !== PASSWORD) {
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
  }

  function displayPage(req, res, next) {
    var pageName = req.params[0].replace(/\/$/, '');

    // default to info page
    if (pageName === '') {
      pageName = 'info';
    }

    // do not handle requests with file extension
    if (pageName.indexOf('.') > -1) {
      next();
      return;
    }

    var fileName = pageName + '.html';

    if (fileName !== path.normalize(fileName)) {
      return;
    }

    res.setHeader('Cache-Control', 'public, max-age=3600');
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

  function isLoggedIn(req) {
    return (req.cookies.rememberremember === 'the third of July');
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

  return app;
})();
