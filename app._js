module.exports = (function() {
  var express = require('express-streamline');

  var bodyParser = require('body-parser');
  var cookieParser = require('cookie-parser');
  var fs = require('fs-extra');
  var logger = require('morgan');
  var moment = require('moment');
  var nunjucks = require('nunjucks');
  var path = require('path');

  var app = express();

  var CONTENT_DIR = 'data';
  var CAKES_DIR = CONTENT_DIR + '/' + 'cakes';
  var COMMENTS_DIR = CONTENT_DIR + '/' + 'comments';
  var GUESTS_DIR = CONTENT_DIR + '/' + 'guests';

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
    'favicon.ico',
  ]);
  addAssetHandler(CONTENT_DIR, ['photos',
  ]);

  app.get(/^\/(.*)$/, displayPage);
  app.post('/guest-list/', handleForm);
  app.post('/info/cake', handleForm);
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

  function compareByDate(a, b) {
    if (a.date > b.date) {
      return -1;
    } else if (a.date < b.date) {
      return 1;
    } else {
      return 0;
    }
  }

  function displayPage(req, res, _) {
    var pageName = req.params[0].replace(/\/$/, '');

    // default to info page
    if (pageName === '') {
      pageName = 'info';
    }

    // do not handle requests with file extension
    if (pageName.indexOf('.') > -1) {
      return true;
    }

    var fileName = pageName + '.html';

    if (fileName !== path.normalize(fileName)) {
      return false;
    }

    var data = {
      activePage: pageName.split('/')[0],
      isLoggedIn: isLoggedIn(req),
    };

    if (pageName === 'guest-list/display') {
      data.allComments = loadJSONObjects(COMMENTS_DIR, _);
      data.allGuests = loadJSONObjects(GUESTS_DIR, _);
    } else if (pageName === 'info/cake') {
      data.allCakes = loadJSONObjects(CAKES_DIR, _);
    }

    res.render(fileName, data);
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

  function handleForm(req, res, _) {
    var input = req.body;

    var data, dir, pageName, redirection;

    switch (input.action) {
      case 'addCake':
      {
        pageName = 'info/cake';
        redirection = '/' + pageName;
        dir = CAKES_DIR;
        break;
      }
      case 'addComment':
      {
        pageName = 'guest-list';
        redirection = '/' + pageName + '/display';
        dir = COMMENTS_DIR;
        break;
      }
      case 'addGuests':
      {
        pageName = 'guest-list';
        redirection = '/' + pageName + '/display';
        dir = GUESTS_DIR;
        break;
      }
    }

    switch (input.action) {
      case 'addCake':
      case 'addComment':
      {
        if (isValidComment(input)) {
          data = {
            guestName: input.guestName,
            text: input.text,
          };
        }

        break;
      }
      case 'addGuests':
      {
        if (isValidReply(input)) {
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
            isDisplayAllowed: (input.isDisplayAllowed === 'true'),
            name: input.name,
            partnerName: input.partnerName,
            answer: (input.answer === 'true'),
            children: children,
            keepMySoul: (input.keepMySoul === 'true'),
          };
        }

        break;
      }
    }

    if (data) {
      var nowInUTC = moment.utc();
      var fileName = dir + '/' + nowInUTC.format() + '.json';
      fs.writeJson(fileName, data, _);
      res.redirect(redirection);
    } else {
      data = input;
      data.activePage = pageName.split('/')[0];
      data.isLoggedIn = isLoggedIn(req);
      res.render(CONTENT_DIR + '/' + pageName + '.html', data);
    }
  }

  function isJSONFile(fileName) {
    return fileName.search(/\.json$/) > -1;
  }

  function isLoggedIn(req) {
    return (req.cookies.rememberremember === 'the third of July');
  }

  function isValidComment(input) {
    if (!input.guestName || !input.text) {
      return false;
    }

    return !(!input.guestName.trim() || !input.text.trim());
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

  function loadJSONObjects(dir, _) {
    var files = fs.readdir(dir, _);

    var allObjects = files.filter(isJSONFile).map_(_, function(_, fileName) {
      var object = fs.readJson(dir + '/' + fileName, _);
      object.date = moment(fileName.replace('.json', ''));
      return object;
    });

    allObjects.sort(compareByDate);

    return allObjects;
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
