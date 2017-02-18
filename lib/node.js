'use strict';

var _fs = require('fs');

var _fs2 = _interopRequireDefault(_fs);

var _path = require('path');

var _path2 = _interopRequireDefault(_path);

var _crypto = require('crypto');

var _crypto2 = _interopRequireDefault(_crypto);

var _lodash = require('lodash');

var _lodash2 = _interopRequireDefault(_lodash);

var _chalk = require('chalk');

var _chalk2 = _interopRequireDefault(_chalk);

var _sourceMapSupport = require('source-map-support');

var _sourceMapSupport2 = _interopRequireDefault(_sourceMapSupport);

var _babelCore = require('babel-core');

var babel = _interopRequireWildcard(_babelCore);

var _cache = require('./cache');

var registerCache = _interopRequireWildcard(_cache);

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) newObj[key] = obj[key]; } } newObj.default = obj; return newObj; } }

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

_sourceMapSupport2.default.install({
  handleUncaughtExceptions: false,
  retrieveSourceMap: function retrieveSourceMap(source) {
    var map = maps && maps[source];
    if (map) {
      return {
        url: null,
        map: map
      };
    } else {
      return null;
    }
  }
});

registerCache.load();
var cache = registerCache.get();
var log = _lodash2.default.noop;
var debug = _lodash2.default.noop;
var pendingSave = false;
var transformOpts = {};
var oldHandlers = {};
var maps = {};
var cwd = process.cwd();

var useRelativeCache = false;
var cacheSourceRoot = void 0;
var projectName = void 0;
var ignore = void 0;
var only = void 0;

function getRelativePath(filename) {
  return _path2.default.relative(cwd, filename);
}

function saveNextTick() {
  if (!pendingSave) {
    pendingSave = true;
    process.nextTick(function () {
      pendingSave = false;
      registerCache.save();
    });
  }
}

function getChecksum(filename) {
  var algorithm = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 'md5';
  var encoding = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : 'hex';

  var fileEncoding = 'utf8';

  return _crypto2.default.createHash(algorithm).update(_fs2.default.readFileSync(filename, { encoding: fileEncoding }), fileEncoding).digest(encoding);
}

function getMtime(filename) {
  return +_fs2.default.statSync(filename).mtime;
}

function buildCacheKey(opts, filename) {
  if (cacheSourceRoot && projectName) {
    opts = _lodash2.default.extend(_lodash2.default.cloneDeep(opts), {
      filename: projectName + ':' + _path2.default.relative(cacheSourceRoot, filename)
    });
  }
  return JSON.stringify(opts) + ':' + babel.version;
}

function compile(filename, code) {
  var result = void 0;

  // merge in base options and resolve all the plugins and presets relative to this file
  var opts = new _babelCore.OptionManager().init(_lodash2.default.extend(_lodash2.default.cloneDeep(transformOpts), {
    filename: filename
  }));

  var cacheKeyOpts = useRelativeCache ? transformOpts : opts;
  var cacheKey = buildCacheKey(cacheKeyOpts, filename);

  var env = process.env.BABEL_ENV || process.env.NODE_ENV;
  if (env) cacheKey += ':' + env;
  var checksum = useRelativeCache ? getChecksum(filename) : null;

  if (cache) {
    var cached = cache[cacheKey];
    // if we're using the relative cache, rely on checksum instead of mtime
    if (cached && useRelativeCache) {
      if (cached.checksum === checksum) {
        debug('[' + projectName + '] from cache ' + filename);
        result = cached;
      } else {
        debug('[' + projectName + '] cache miss due to checksum ' + filename);
      }
    } else if (cached) {
      if (cached.mtime === getMtime(filename)) {
        debug('[' + projectName + '] from cache ' + filename);
        result = cached;
      } else {
        debug('[' + projectName + '] cache miss due to mtime ' + filename);
      }
    }
  }

  if (!result) {
    log(_chalk2.default.gray('[' + projectName + '] transforming ' + filename));
    var transformOptions = _lodash2.default.extend(opts, {
      // Do not process config files since has already been done with the OptionManager
      // calls above and would introduce duplicates.
      babelrc: false,
      sourceMap: 'both',
      ast: false
    });
    if (code) {
      result = babel.transform(code, transformOptions);
    } else {
      result = babel.transformFileSync(filename, transformOptions);
    }
    saveNextTick();
  }

  if (cache) {
    cache[cacheKey] = result;
    result.mtime = getMtime(filename);
    result.checksum = checksum;
  }

  maps[filename] = result.map;

  return result.code;
}

function shouldIgnore(filename) {
  if (!ignore && !only) {
    return getRelativePath(filename).split(_path2.default.sep).indexOf('node_modules') >= 0;
  } else {
    return _babelCore.util.shouldIgnore(filename, ignore || [], only);
  }
}

function loader(m, filename, code) {
  m._compile(compile(filename, code), filename);
}

function registerExtension(ext) {
  var old = oldHandlers[ext] || oldHandlers['.js'] || require.extensions['.js'];

  require.extensions[ext] = function (m, filename, code) {
    if (shouldIgnore(filename)) {
      debug('[' + projectName + '] ignoring ' + filename);
      old(m, filename);
    } else {
      debug('[' + projectName + '] loading ' + filename);
      loader(m, filename, code, old);
    }
  };
}

function hookExtensions(_exts) {
  debug('[' + projectName + '] extensions ' + _exts);
  _lodash2.default.each(oldHandlers, function (old, ext) {
    if (old === undefined) {
      delete require.extensions[ext];
    } else {
      require.extensions[ext] = old;
    }
  });

  oldHandlers = {};

  _lodash2.default.each(_exts, function (ext) {
    oldHandlers[ext] = require.extensions[ext];
    registerExtension(ext);
  });
}

hookExtensions(_babelCore.util.canCompile.EXTENSIONS);

module.exports = function () {
  var opts = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};


  if (opts.only != null) only = _babelCore.util.arrayify(opts.only, _babelCore.util.regexify);
  if (opts.ignore != null) ignore = _babelCore.util.arrayify(opts.ignore, _babelCore.util.regexify);
  if (opts.cache === false) cache = null;
  if (opts.log) log = opts.log;
  if (opts.debug) debug = opts.debug;

  if (opts.cacheSourceRoot && opts.projectName) {
    cacheSourceRoot = opts.cacheSourceRoot;
    projectName = opts.projectName;
    useRelativeCache = true;
  }

  if (opts.cacheSourceRoot && !opts.projectName || !opts.cacheSourceRoot && opts.projectName) {
    log('must have both cacheSourceRoot and projectName');
  }

  projectName = projectName || 'BABEL';

  if (opts.extensions) hookExtensions(_babelCore.util.arrayify(opts.extensions));

  delete opts.extensions;
  delete opts.ignore;
  delete opts.cache;
  delete opts.only;
  delete opts.log;
  delete opts.debug;
  delete opts.cacheSourceRoot;
  delete opts.projectName;

  _lodash2.default.extend(transformOpts, opts);
};