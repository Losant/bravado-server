const requiredHeaders = ['Accept', 'Content-Type', 'X-Amz-Date', 'Authorization', 'Accept-Version'];

module.exports = {
  preflight: function({ extraHeaders = [], allowedMethods = [], shouldSet = true }) {
    if (!shouldSet) { return; }
    const allowedHeaders = new Set(requiredHeaders);
    extraHeaders.forEach((header) => { allowedHeaders.add(header); });
    return function(req, res, next) {
      res.header('Access-Control-Allow-Headers', [...allowedHeaders].join(','));
      res.header('Access-Control-Allow-Methods', [...allowedMethods].join(','));
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
