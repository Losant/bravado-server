const requiredHeaders = ['Accept', 'Content-Type', 'X-Amz-Date', 'Authorization', 'Accept-Version'];

module.exports = {
  preflight: function({ extraHeaders = [] }) {
    const allowedHeaders = [...new Set([...requiredHeaders, ...extraHeaders])].join(',');
    return function(req, res, next) {
      res.header('Access-Control-Allow-Headers', allowedHeaders);
      res.header('Access-Control-Allow-Methods', '*');
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
