#!/usr/bin/env node

var express = require('express');
var app = require('express')();
var http = require('http').Server(app);
var fs = require('fs');
var path = require('path');
var util = require('util');
var url = require('url');
var _ = require('lodash');
var bodyParser = require('body-parser');
var isBinaryFile = require("isbinaryfile");
var argv = require('optimist')
    .default('port', 3348)
    .default('dir', process.cwd())
    .string('username')
    .string('password')
    .string('secret')
    .demand(['username', 'password', 'secret'])
    .argv;

var session = require('express-session');
app.use(session({
    secret: argv.secret,
    resave: true,
    saveUninitialized: true
}));

app.use(bodyParser.json({limit: '5mb'}));       // to support JSON-encoded bodies
app.use(bodyParser.urlencoded({     // to support URL-encoded bodies
  limit: '5mb',
  extended: true
}));

app.use('/lib', express.static(__dirname + '/../lib'));
app.use('/codemirror', express.static(__dirname + '/../node_modules/codemirror-minified'));
app.use('/src', express.static(__dirname));

// Authentication and Authorization Middleware
var auth = function(req, res, next) {
  var path = url.parse(req.url).pathname;
  if (req.session && req.session.user === argv.username && req.session.admin) {
    return next();
  } else {
    return res.sendFile(__dirname + '/login.html');
  }
};

// Login endpoint
app.post('/login', function (req, res) {
  if (!req.body.user || !req.body.pass) {
    res.sendFile(__dirname + '/login.html');
  } else if (req.body.user === argv.username && req.body.pass === argv.password) {
    req.session.user = argv.username;
    req.session.admin = true;
    res.redirect('/');
  } else {
    res.sendFile(__dirname + '/login.html');
  }
});

// Logout endpoint
app.get('/logout', function (req, res) {
  req.session.destroy();
  res.sendFile(__dirname + '/login.html');
});

// Keeps track of the last visited dir.
var lastDir;
var configDir = path.join(process.env.HOME, '.mirror-me');
try {
  fs.statSync(configDir);
} catch(e) {
  fs.mkdirSync(configDir);
}
var favConfigPath = path.join(configDir, 'fav-dirs');
fs.closeSync(fs.openSync(favConfigPath, 'a'));
var settingsConfigPath = path.join(configDir, 'settings.json');
// Read settings
try {
  fs.statSync(settingsConfigPath);
} catch(e) {
  defaultSettings = fs.readFileSync(__dirname + '/../default-settings.json', 'utf8');
  fs.writeFileSync(settingsConfigPath, defaultSettings);
}

var favoriteDirs = [];

// Read favoriteDirs
try {
  fs.statSync(favConfigPath);
  var favContent = fs.readFileSync(favConfigPath, {encoding: 'utf8'});
  favContent.split('\n').forEach(function(f) {
    if (f) {
      favoriteDirs.push(f);
    }
  });
} catch(e) {
  console.log(e);
}

app.get('/', auth, function(req, res) {
  res.sendFile(__dirname + '/editor.html');
});

app.get('/cat', auth, function(req, res) {
  var filePath = req.query.path || '';
  if (!filePath) {
    return;
  }
  try {
    var fileStat = fs.statSync(filePath);
    if (!fileStat.isFile()) {
      res.json({
        Status: 'ERROR',
        Message: 'Not a regular file: ' + filePath
      });
      return;
    }
    if (isBinaryFile.sync(filePath)) {
      res.json({
        Status: 'ERROR',
        Message: filePath + ', seems to be a binary file. We cannot edit!'
      });
      return;
    }
    var fileContent = fs.readFileSync(filePath, {encoding: 'utf8'});
    var resData = {
      Path: filePath,
      FileContent: fileContent,
      Status: 'OK',
      MTime: fileStat.mtime.getTime(),
    };
    res.json(resData);
  } catch(e) {
    res.json({
      Status: 'ERROR',
      Message: 'File does not exit: ' + filePath
    });
    return;
  }
});

app.get('/fstat', auth, function(req, res) {
  var filePath = req.query.path || '';
  if (!filePath) {
    res.json({
      Status: 'ERROR',
      Message: 'File path not specified.'
    });
    return;
  }
  try {
    var fileStat = fs.statSync(filePath);
    res.json({
      Status: 'OK',
      Path: filePath,
      MTime: fileStat.mtime.getTime(),
      IsDirectory: fileStat.isDirectory(),
      IsRegularFile: fileStat.isFile(),
      IsBinaryFile: isBinaryFile.sync(filePath),
    });
    return;
  } catch(e) {
    res.json({
      Status: 'ERROR',
      Message: 'File does not exit: ' + filePath
    });
    return;
  }
});

app.post('/save', auth, function(req, res) {
  try {
    var fileStat = fs.statSync(req.body.Path);
    if (req.body.MTime &&
        fileStat.mtime.getTime() !== parseInt(req.body.MTime)) {
      res.json({
        Status: 'ERROR',
        Message: 'File has been modified on the server.',
        MTime: fileStat.mtime.getTime(),
      });
      return;
    }
    fs.writeFileSync(req.body.Path, req.body.Content);
    fileStat = fs.statSync(req.body.Path);
    res.json({
      Status: 'OK',
      MTime: fileStat.mtime.getTime()
    });
    return;
  } catch(e) {
    res.json({
      Status: 'ERROR',
      Message: e
    });
  }
});

function quoteRegExp(str) {
  return (str+'').replace(/[.?*+^$[\]\\(){}|-]/g, "\\$&");
}

app.get('/ls', auth, function(req, res) {
  var rootDir = req.query.path || '';
  var pattern = req.query.pattern || '';
  if (!rootDir) {
    if (lastDir) {
      rootDir = lastDir;
    } else {
      rootDir = argv.dir;
    }
  } else {
    lastDir = rootDir;
  }
  try {
    rootDir = fs.realpathSync(rootDir);
  } catch (e) {
    res.json({
      Status: 'ERROR',
      Message: e
    });
    return;
  }
  var fileStat = fs.statSync(rootDir);
  if (fileStat.isDirectory()) {
    fs.readdir(rootDir, function(err, files) {
      if (err) {
        throw err;
      }
      var fileDirs = [];
      var matcher = new RegExp(quoteRegExp(pattern), "i");
      if (rootDir !== '/') {
        files.unshift('..');
      }
      files = files.filter(function(file) {
        return matcher.test(file);
      });
      files.slice(0, 100).forEach(function(file) {
        try {
          var fullFilePath = path.join(rootDir, file);
          var isDirectory = fs.statSync(fullFilePath).isDirectory();
          var fileData = {
            FileName: file,
            FileDir: rootDir,
            IsDirectory: isDirectory,
            Path: fullFilePath,
          };
          fileDirs.push(fileData);
        } catch (e) {
          console.log(e);
        }
      });
      fileDirs = _.sortBy(fileDirs, [function(f) {
        return !f.IsDirectory; // Directories first
      }, function(f) {
        return f.FileName;
      }]);
      var data = {
        Files: fileDirs,
        Path: rootDir,
        IsFav: favoriteDirs.indexOf(rootDir) > -1,
        Status: 'OK'
      };
      res.json(data);
    });
  } else {
    res.json({
      Status: 'ERROR',
      Message: rootDir + ' is not a directory.'
    });
    return;
  }
});

Array.prototype.remove = function() {
  var what, a = arguments, L = a.length, ax;
  while (L && this.length) {
    what = a[--L];
    while ((ax = this.indexOf(what)) !== -1) {
      this.splice(ax, 1);
    }
  }
  return this;
};

function addRemoveFav(path, isFav) {
  if (isFav && favoriteDirs.indexOf(path) < 0) {
    favoriteDirs.push(path);
  } else {
    favoriteDirs.remove(path);
  }
  var file = fs.createWriteStream(favConfigPath);
  file.on('error', function(err) { console.log(err); });
  favoriteDirs.forEach(function(v) { file.write(v + '\n'); });
  file.end();
}

app.get('/fav', auth, function(req, res) {
  var path = req.query.path;
  var isFav = req.query.is;
  addRemoveFav(path, isFav);
  var data = {
    Status: 'OK',
  };
  res.json(data);
});

app.get('/settings', auth, function(req, res) {
  var settingsContent;
  try {
    settingsContent = fs.readFileSync(settingsConfigPath, {encoding: 'utf8'});
    res.json({
      Status: 'OK',
      Settings: JSON.parse(settingsContent)
    });
  } catch(e) {
    res.json({
      Status: 'ERROR',
      Message: e
    });
  }
});

app.get('/ls-fav', auth, function(req, res) {
  favoriteDirs.sort();
  var data = {
    Favs: favoriteDirs,
  };
  res.json(data);
});

http.listen(argv.port, '0.0.0.0');
