const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const _ = require('lodash');
const chalk = require('chalk');
const sourceMapSupport = require('source-map-support');
const babel = require('babel-core');
const registerCache = require('./cache');

sourceMapSupport.install({
  handleUncaughtExceptions: false,
  retrieveSourceMap(source) {
    let map = maps && maps[source];
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
let cache = registerCache.get();
let log = _.noop;
let debug = _.noop;
let pendingSave = false;
let transformOpts = {};
let oldHandlers   = {};
let maps          = {};
let cwd = process.cwd();

let useRelativeCache = false;
let cacheSourceRoot;
let projectName;
let ignore;
let only;

function getRelativePath(filename){
  return path.relative(cwd, filename);
}

function saveNextTick() {
  if (!pendingSave) {
    pendingSave = true;
    process.nextTick(() => {
      pendingSave = false;
      registerCache.save();
    });
  }
}

function getChecksum (filename, algorithm = 'md5', encoding = 'hex') {
  let fileEncoding = 'utf8';

  return crypto
    .createHash(algorithm)
    .update(fs.readFileSync(filename, {encoding: fileEncoding}), fileEncoding)
    .digest(encoding)
}

function getMtime(filename) {
  return +fs.statSync(filename).mtime;
}

function buildCacheKey(opts, filename) {
  if (cacheSourceRoot && projectName) {
    opts = _.extend(_.cloneDeep(opts), {
      filename: `${projectName}:${path.relative(cacheSourceRoot, filename)}`
    });
  }
  return `${JSON.stringify(opts)}:${babel.version}`;
}

function compile(filename, code) {
  let result;

  // merge in base options and resolve all the plugins and presets relative to this file
  let opts = new babel.OptionManager().init(_.extend(_.cloneDeep(transformOpts), {
    filename
  }));

  let cacheKeyOpts = (useRelativeCache) ? transformOpts : opts;
  let cacheKey = buildCacheKey(cacheKeyOpts, filename);

  let env = process.env.BABEL_ENV || process.env.NODE_ENV;
  if (env) cacheKey += `:${env}`;
  let checksum = useRelativeCache ? getChecksum(filename) : null;

  if (cache) {
    let cached = cache[cacheKey];
    // if we're using the relative cache, rely on checksum instead of mtime
    if (cached && useRelativeCache) {
      if (cached.checksum === checksum) {
        debug(`[${projectName}] from cache ${filename}`);
        result = cached;
      } else {
        debug(`[${projectName}] cache miss due to checksum ${filename}`)
      }
    } else if (cached) {
      if (cached.mtime === getMtime(filename)) {
        debug(`[${projectName}] from cache ${filename}`);
        result = cached;
      } else {
        debug(`[${projectName}] cache miss due to mtime ${filename}`)
      }
    }
  }

  if (!result) {
    log(chalk.gray(`[${projectName}] transforming ${filename}`));
    let transformOptions = _.extend(opts, {
      // Do not process config files since has already been done with the OptionManager
      // calls above and would introduce duplicates.
      babelrc:   false,
      sourceMap: 'both',
      ast:       false
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
    return getRelativePath(filename).split(path.sep).indexOf('node_modules') >= 0;
  } else {
    return babel.util.shouldIgnore(filename, ignore || [], only);
  }
}

function loader(m, filename, code) {
  m._compile(compile(filename, code), filename);
}

function registerExtension(ext) {
  let old = oldHandlers[ext] || oldHandlers['.js'] || require.extensions['.js'];

  require.extensions[ext] = function (m, filename, code) {
    if (shouldIgnore(filename)) {
      debug(`[${projectName}] ignoring ${filename}`)
      old(m, filename);
    } else {
      debug(`[${projectName}] loading ${filename}`)
      loader(m, filename, code, old);
    }
  };
}

function hookExtensions(_exts) {
  debug(`[${projectName}] extensions ${_exts}`)
  _.each(oldHandlers, function (old, ext) {
    if (old === undefined) {
      delete require.extensions[ext];
    } else {
      require.extensions[ext] = old;
    }
  });

  oldHandlers = {};

  _.each(_exts, function (ext) {
    oldHandlers[ext] = require.extensions[ext];
    registerExtension(ext);
  });
}

hookExtensions(babel.util.canCompile.EXTENSIONS);

module.exports = function (opts = {}) {

  if (opts.only != null) only = babel.util.arrayify(opts.only, babel.util.regexify);
  if (opts.ignore != null) ignore = babel.util.arrayify(opts.ignore, babel.util.regexify);
  if (opts.cache === false) cache = null;
  if (opts.log) log = opts.log;
  if (opts.debug) debug = opts.debug;

  if (opts.cacheSourceRoot && opts.projectName) {
    cacheSourceRoot = opts.cacheSourceRoot;
    projectName = opts.projectName;
    useRelativeCache = true;
  }

  if ((opts.cacheSourceRoot && !opts.projectName) || (!opts.cacheSourceRoot && opts.projectName)) {
    log('must have both cacheSourceRoot and projectName');
  }

  projectName = projectName || 'BABEL';

  if (opts.extensions) hookExtensions(babel.util.arrayify(opts.extensions));

  delete opts.extensions;
  delete opts.ignore;
  delete opts.cache;
  delete opts.only;
  delete opts.log;
  delete opts.debug;
  delete opts.cacheSourceRoot;
  delete opts.projectName;

  _.extend(transformOpts, opts);
}
