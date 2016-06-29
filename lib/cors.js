var defaults = require('defaults');
var defined = require('defined');

var requiredHeaders = ['Accept', 'Content-Type', 'X-Amz-Date', 'Authorization', 'Accept-Version'];

module.exports = {
  preflight: function (options) {
    options = defaults(options, { extraHeaders: [] });
    var allowedHeaders = requiredHeaders.concat(options.extraHeaders || []);
    return function (req, res, next) {
      var requestedMethod = req.headers['access-control-request-method'];
      var allowedMethods = defined(options.allowMethods, [requestedMethod.toUpperCase(), 'OPTIONS']);
      res.header('Access-Control-Allow-Headers', allowedHeaders.join(','));
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
