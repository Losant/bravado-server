var bravado = require('bravado-core');

module.exports = function (api, resourceName, actionName, impl) {
  var resource = api.resources[resourceName];
  var action = resource.actions[actionName];
  var handler = bravado.handler(api, resourceName, actionName, impl);
  return function (req, res, next) {
    var event = {
      type: 'http-request',
      path: action._fullPath,
      method: req.method.toUpperCase(),
      ip: req.connection.remoteAddress,
      requestId: req.id(),
      request: {
        path: req.params,
        querystring: req.query,
        headers: req.headers,
        body: req.body
      }
    };
    var context = {
      succeed: function (response) {
        context.done(null, response);
      },
      fail: function (err) {
        context.done(err);
      },
      done: function (err, response) {
        if (err) {
          if ('string' === typeof err) {
            err = new Error(err);
          }
          return next(err);
        }
        var statusCode = 200, body = response;
        if ('object' === typeof response && response.statusCode) {
          statusCode = response.statusCode;
          body = response.body;
        }
        res.json(statusCode, body);
        next();
      }
    };
    handler(event, context);
  };
};
