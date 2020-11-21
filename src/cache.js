const path = require('path');
const fs = require('fs');
const mkdirp = require('mkdirp');
const homeOrTmp = require('home-or-tmp');
const pathExists = require('path-exists');

const FILENAME = process.env.BABEL_CACHE_PATH || path.join(homeOrTmp, '.riq-babel-register.json');
let data = {};

/**
 * Write stringified cache to disk.
 */

const save = () => {
  let serialised = {};
  try {
    serialised = JSON.stringify(data, null, '  ');
  } catch (err) {
    if (err.message === 'Invalid string length') {
      err.message = 'Cache too large so it\'s been cleared.';
      console.error(err.stack);
    } else {
      throw err;
    }
  }
  mkdirp.sync(path.dirname(FILENAME));
  fs.writeFileSync(FILENAME, serialised);
}

/**
 * Load cache from disk and parse.
 */

const load = () => {
  if (process.env.BABEL_DISABLE_CACHE) return;

  process.on('exit', save);
  process.nextTick(save);

  if (!pathExists.sync(FILENAME)) return;

  try {
    data = JSON.parse(fs.readFileSync(FILENAME));
  } catch (err) {
    return;
  }
}

/**
 * Retrieve data from cache.
 */

function get() {
  return data;
}

exports.save = save;
exports.load = load;
exports.get = get;
