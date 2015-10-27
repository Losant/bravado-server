var bravado = require('bravado-core');

module.exports = function (api, resourceName, actionName, controller) {
  var resource = api.resources[resourceName];
  var action = resource.actions[actionName];
  var handler = bravado.handler(api, resourceName, actionName, controller);
  return function (req, res, next) {
    var event = {
      httpRequest: true,
      path: action['x-bravado-fullPath'],
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
      statusCode: 200,
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
        res.json(this.statusCode, response);
        next();
      }
    };
    handler(event, context);
  };
};
