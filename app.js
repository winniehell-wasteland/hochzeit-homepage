module.exports = (function() {
  var express = require('express');

  var bodyParser = require('body-parser');
  var cookieParser = require('cookie-parser');
  var fs = require('fs-extra');
  var logger = require('morgan');
  var moment = require('moment');
  var nunjucks = require('nunjucks');
  var path = require('path');

  var app = express();

  var CONTENT_DIR = 'data';
  var MAX_CHILD_COUNT = 4;
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
    extended: true,
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
  app.post('/guest-list', handleGuestListForm);
  app.use(fallbackHandler);
  app.use(errorHandler);

  function addAssetHandler(baseDir, subDirs) {
    subDirs.forEach(function(subDir) {
      app.use('/' + subDir, express.static(path.join(baseDir, subDir), {
        index: false,
        maxAge: '1 days',
      }));
    });
  }



  function isValidComment(input) {
    if (!input.name || !input.comment) {
      return false;
    }

    return !(!input.name.trim() || !input.comment.trim());
  }

  function isValidReply(input) {
    if (!input.name) {
      return false;
    }

    if (!input.answer || !input.isDisplayAllowed) {
      return false;
    }

    for (var i = 0; i < MAX_CHILD_COUNT; ++i) {
      if (!input.childNames[i] != !input.childAges[i]) {
          return false;
        }
    }

    return true;
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
    next(new Error('Not Found'));
  }

  function handleGuestListForm(req, res, next) {
    var input = req.body;

    var data, dir;
    if ((input.action === 'addComment') && isValidComment(input)) {
      dir = 'comments';
      data = {
        name: input.name,
        comment: input.comment,
      };
    } else if ((req.body.action === 'addGuests') && isValidReply(input)) {
      dir = 'guests';

      var children = [];
      for (var i = 0; i < MAX_CHILD_COUNT; ++i) {
        if (input.childNames[i]) {
          children.push({
            name: input.childNames[i],
            age: input.childAges[i],
          });
        }
      }

      data = {
        name: input.name,
        partnerName: input.partnerName,
        isValidReply: input.isValidReply,
        answer: input.answer,
        children: children,
        keepmysoul: input.keepmysoul,
      };
    } else {
      input.isLoggedIn = isLoggedIn(req);
      //console.log('input: ' + JSON.stringify(input));
      res.render('guest-list.html', input);
    }

    if (data) {
      var nowInUTC = moment.utc();
      var fileName = CONTENT_DIR + '/guest-list/guests/' + nowInUTC.format();
      fs.writeJson(fileName, data, function(err) {
        if (err) {
          next(err);
        } else {
          res.redirect('/guest-list/display/');
        }
      });
    }
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
