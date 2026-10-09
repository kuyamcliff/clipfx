'use strict';
// Every page template, by the name src/app.js renders it with.
module.exports = {
  ...require('./assets'),
  ...require('./browse'),
  ...require('./account'),
  ...require('./admin'),
  ...require('./static'),
};
