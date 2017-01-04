var bravado = require('bravado-core');
var assign = require('object-assign');
var EventEmitter = require('events').EventEmitter;
var debug = require('debug')('bravado:server:route');

module.exports = function (api, resourceName, actionName, controller, baseContext) {
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
        body: req.body,
        files: req.files
      }
    };
    var _done = function (err, response) {
      debug('resource response', response);
      if (err) {
        debug('resource error', err);
        var message = ('string' === typeof err) ? message = err : err.message;
        res.caughtError = err;
        res.json(
          err.statusCode || 500,
          { type: err.type || 'Error', message: message }
        );
        next();
      } else if (response instanceof EventEmitter && req.accepts('text/event-stream')) {
        res.header('Content-Type', 'text/event-stream');
        if (res.handledGzip) {
          res.handledGzip();
          res.setHeader('Content-Encoding', null);
        }
        response.on('event', function (event) {
          var e = '';
          if (typeof event.event !== 'undefined') {
            e += 'event: ' + event.event + '\n';
          }
          if (typeof event.data !== 'undefined') {
            e += 'data: ' + JSON.stringify(event.data) + '\n';
          }
          if (typeof event.id !== 'undefined') {
            e += 'id: ' + event.id + '\n';
          }
          if (typeof event.retry !== 'undefined') {
            e += 'retry: ' + event.retry + '\n';
          }
          res.write(e + '\n');
        });
        response.on('comment', function (comment) {
          res.write(':' + comment + '\n\n');
        });
        response.on('ping', function () {
          res.write(':\n\n');
        });
        req.connection.on('close', function () {
          response.removeAllListeners();
        });
      } else {
        res.json(this.statusCode, response);
        next();
      }
    };
    var context = assign({}, {
      statusCode: 200,
      succeed: function (response) {
        _done(null, response);
      },
      fail: function (err) {
        _done(err);
      },
      done: function (err, response) {
        _done(err, response);
      }
    }, baseContext);

    res._bravado = {
      context: context,
      event: event,
      resourceName: resourceName,
      actionName: actionName
    };

    handler(event, context);
  };
};
