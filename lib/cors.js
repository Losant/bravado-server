const { mergeRight } = require('omnibelt');
const requiredHeaders = ['Accept', 'Content-Type', 'X-Amz-Date', 'Authorization', 'Accept-Version'];

module.exports = {
  preflight: function(options) {
    if (!options.shouldSet) { return; }
    options = mergeRight({ extraHeaders: [] }, options);
    const allowedHeaders = requiredHeaders.concat(options.extraHeaders);
    return function(req, res, next) {
      const allowedMethods = options.allowedMethods;
      res.header('Access-Control-Allow-Headers', allowedHeaders.join(','));
      res.header('Access-Control-Allow-Methods', allowedMethods.join(','));
      res.header('Access-Control-Allow-Origin', '*');
      res.send(204);
      return next();
    };
  },
  headers: function() {
    return function(req, res, next) {
      res.header('Access-Control-Allow-Origin', '*');
      return next();
    };
  }
};
