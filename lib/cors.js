var defaults = require('defaults');
var defined = require('defined');

module.exports = {
  preflight: function (options) {
    options = defaults(options, {
      allowHeaders: ['Accept', 'Content-Type', 'X-Amz-Date', 'Authorization'],
    });
    return function (req, res, next) {
      var origin = req.headers['origin'];
      var requestedMethod = req.headers['access-control-request-method'];
      var allowedMethods = defined(options.allowMethods, [requestedMethod.toUpperCase(), 'OPTIONS']);
      res.header('Access-Control-Allow-Headers', options.allowHeaders.join(','));
      res.header('Access-Control-Allow-Methods', allowedMethods.join(','));
      res.header('Access-Control-Allow-Origin', '*');
      // res.header('Access-Control-Allow-Credentials', true);
      res.send(204);
      return next();
    };
  },
  headers: function () {
    return function (req, res, next) {
      res.header('Access-Control-Allow-Origin', '*');
      return next();
    };
  }
};
