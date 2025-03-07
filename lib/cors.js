const requiredHeaders = ['Accept', 'Content-Type', 'X-Amz-Date', 'Authorization', 'Accept-Version', 'Vary'];

export default {
  preflight: function({ extraHeaders = [] }) {
    const allowedHeaders = [...new Set([...requiredHeaders, ...extraHeaders])].join(',');
    return function(req, res, next) {
      res.header('Access-Control-Allow-Headers', allowedHeaders);
      res.header('Access-Control-Allow-Methods', 'DELETE,GET,HEAD,OPTIONS,PATCH,POST,PUT');
      res.header('Access-Control-Allow-Origin', req.headers?.origin || '*');
      res.header('vary', 'origin');
      res.send(204);
      return next();
    };
  },
  headers: function() {
    return function(req, res, next) {
      res.header('Access-Control-Allow-Origin', req.headers?.origin || '*');
      res.header('vary', 'origin');
      return next();
    };
  }
};
