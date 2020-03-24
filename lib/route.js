const bravado = require('bravado-core');
const EventEmitter = require('events').EventEmitter;
const debug = require('debug')('bravado:server:route');
const { omit, clone } = require('omnibelt');

module.exports = function(api, resourceName, actionName, controller, baseContext, errorTransform) {
  const resource = api.resources[resourceName];
  const action = resource.actions[actionName];
  const handler = bravado.handler(api, resourceName, actionName, controller);
  return function(req, res, next) {
    const event = {
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
        files: req.files,
        bodyStream: req.body === undefined ? req : undefined
      }
    };
    let context;
    const _done = function(err, response) {
      debug('resource response', response);
      if (err) {
        debug('resource error', err);
        res.caughtError = err;
        const { code, body } = errorTransform(err);
        res.json(code, body);
        return next();
      } else if (response instanceof EventEmitter) {
        res.header('Content-Type', 'text/event-stream');
        if (res.handledGzip) {
          res.handledGzip();
          res.setHeader('Content-Encoding', null);
        }
        response.on('event', function(sseEvent) {
          let e = '';
          if (typeof sseEvent.event !== 'undefined') {
            e += `event: ${sseEvent.event}\n`;
          }
          if (typeof sseEvent.data !== 'undefined') {
            e += `data: ${JSON.stringify(sseEvent.data)}\n`;
          }
          if (typeof sseEvent.id !== 'undefined') {
            e += `id: ${sseEvent.id}\n`;
          }
          if (typeof sseEvent.retry !== 'undefined') {
            e += `retry: ${sseEvent.retry}\n`;
          }
          res.write(`${e}\n`);
        });
        response.on('comment', function(comment) {
          res.write(`:${comment}\n\n`);
        });
        response.on('ping', function() {
          res.write(':\n\n');
        });
        response.on('close', function() {
          res.end();
          response.removeAllListeners();
        });
        req.connection.on('close', function() {
          response.removeAllListeners();
        });
      } else {
        res.json(context.statusCode, response);
        return next();
      }
    };
    context = Object.assign({}, {
      statusCode: 200,
      succeed: function(response) {
        _done(null, response);
      },
      fail: function(err) {
        _done(err);
      },
      done: function(err, response) {
        _done(err, response);
      }
    }, baseContext);

    res._bravado = {
      context,
      event: clone(omit(['request.bodyStream'], event)),
      resourceName,
      actionName
    };

    try {
      handler(event, context);
    } catch (e) {
      context.fail(e);
    }
  };
};
