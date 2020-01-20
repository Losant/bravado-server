const { mergeRight } = require('omnibelt');
const requiredHeaders = ['Accept', 'Content-Type', 'X-Amz-Date', 'Authorization', 'Accept-Version'];

module.exports = {
  preflight: function(options) {
    options = mergeRight({ extraHeaders: [] }, options);
    const allowedHeaders = requiredHeaders.concat(options.extraHeaders || []);
    return function(req, res, next) {
      const requestedMethod = req.headers['access-control-request-method'];
      const defaultAllowed = ['OPTIONS'];
      if (requestedMethod) { defaultAllowed.push(requestedMethod.toUpperCase()); }
      const allowedMethods = options.allowMethods || defaultAllowed;
      res.header('Access-Control-Allow-Headers', allowedHeaders.join(','));
      res.header('Access-Control-Allow-Methods', allowedMethods.join(','));
      res.header('Access-Control-Allow-Origin', '*');
      // res.header('Access-Control-Allow-Credentials', true);
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
