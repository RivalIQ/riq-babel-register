# riq-babel-register

The require hook will bind itself to node's require and automatically compile files on the fly.

This fork of babel-require supports file cache paths relative to a `cacheSourceRoot` as well as optional logging.

## Install

```
$ npm install riq-babel-register
```

## Usage

```js
require("riq-babel-register");
```

All subsequent files required by node with the extensions `.es6`, `.es`, `.jsx` and `.js` will be transformed by Babel.

See [documentation](http://babeljs.io/docs/usage/require/) for details.
