# riq-babel-register

The require hook will bind itself to node's require and automatically compile files on the fly.

This fork of babel-require supports file cache paths relative to a `cacheSourceRoot` as well as optional logging.

## Install

```
$ npm install riq-babel-register
```

## Usage

```js
require("riq-babel-register")({
  presets: ['es2015', 'stage-0'],
  plugins: [
    ['streamline', {
        extensions: ['._js'],
        runtime: 'fibers',
        verbose: true
    }]
  ],
  cacheSourceRoot: __dirname,
  projectName: 'my-server',
  extensions: ['._js'],
  debug: winston.debug.bind(winston),
  log: winston.info.bind(winston)
});
```

All subsequent files required by node with the extensions `.es6`, `.es`, `.jsx` and `.js` will be transformed by Babel.

See [documentation](http://babeljs.io/docs/usage/require/) for details.

## Changes in behavior from babel-register

When both `cacheSourceRoot` and `projectName` are provided files will be cached with project relative paths
(e.g. fileName: 'my-server:/services/support/db.\_js'). As these are intended to be use in conjunction with with Heroku's `cachedDirectories` feature and the `BABEL_CACHE_PATH` environment variable to preserve cached across deploys/restarts, the mtime of the file is ignored and an MD5 hash of the files contents is used instead.

The `log` or `debug` functions are optional and when provided, `riq-babel-register` will use the provided functions to log it's progress. When omitted, `riq-babel-register` will log nothing.

In the absence of a `BABEL_CACHE_PATH` environment variable, transformed files will be stored in `$HOME-OR_TMP/riq-babel-register.json`

## Consistent behavior with babel-register that will change in future versions

As of version `0.1.0` subsequent calls to `riq-babel-register` will replace any existing hooks with hooks generated with the new configuration. This means that if multiple modules within a project call `riq-babel-register`, the last caller will 'win'. Future versions will take the `projectName` and `cacheSourceRoot` into account and chain project transformations together allowing each project to control the transformation settings of it's own files.
