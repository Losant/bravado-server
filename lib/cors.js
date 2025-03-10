const requiredHeaders = [
  'Accept',
  'Content-Type',
  'X-Amz-Date',
  'Authorization',
  'Accept-Version'
];

export default {
  preflight: function({ extraHeaders = [] }) {
    const allowedHeaders = [...new Set([...requiredHeaders, ...extraHeaders])].join(',');
    return function(req, res, next) {
      res.header('Access-Control-Allow-Headers', allowedHeaders);
      res.header('Access-Control-Allow-Methods', 'DELETE,GET,HEAD,OPTIONS,PATCH,POST,PUT');
      res.header('Access-Control-Allow-Origin', req.headers?.origin || '*');
      res.header('Access-Control-Max-Age', 86400);
      res.header('Vary', 'origin');
      res.send(204);
      return next();
    };
  },
  headers: function() {
    return function(req, res, next) {
      res.header('Access-Control-Allow-Origin', req.headers?.origin || '*');
      res.header('Vary', 'origin');
      return next();
    };
  }
};
