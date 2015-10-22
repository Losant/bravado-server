var restify = require('restify');
var bunyan = require('bunyan');
var q = require('q');
var debug = require('debug')('bravado:server');
var path = require('path');
var inflection = require('inflection');
var package = require('../package.json');
var config = require('./config');
var bravado = require('bravado-core');
var cors = require('./cors');
var routeHandler = require('./route');

var server = undefined;

module.exports = {

  start: function (api, options) {
    debug('starting server');
    if (options) {
      config.load(options);
      config.validate({strict: true});
    }

    var serverOptions = {
      name: config.get('name'),
      version: package.version
    };

    server = restify.createServer(serverOptions);
    server.use(restify.queryParser({ mapParams: false }));
    server.use(restify.gzipResponse());
    server.use(restify.bodyParser({
      mapParams: false,
      mapFiles: false
    }));

    // load api definitions
    var loadPromise;
    if ('string' === typeof api) {
      loadPromise = bravado.ApiDefinition.load(api);
    } else if (Array.isArray(api)) {
      loadPromise = q.all(api.map(function (item) {
        return bravado.ApiDefinition.load(api);
      }));
    }

    return loadPromise
      .then(function (defs) {
        var routes = {};
        debug('api definition loaded: %j', api);
        if (!Array.isArray(defs)) {
          defs = [defs];
        }
        defs.forEach(function (def) {
          def.validate();
          var resourcePath = path.resolve(path.dirname(def._source), config.get('path'));
          for (var r in def.resources) {
            var implPath = path.resolve(resourcePath, inflection.transform(r, ['underscore', 'dasherize']));
            var resource = def.resources[r];
            for (var a in resource.actions) {
              var action = resource.actions[a];
              var method = action.method.toLowerCase();
              if (method === 'delete') { method = 'del'; }
              if (method === 'options') { method = 'opts'; }
              var fullPath = action['x-bravado-fullPath'];
              var routePath = fullPath.replace(/\{((?:[\w.~-]|(?:%[0-9A-F]{2}))+)\}/g, ':$1');
              if (!routes[routePath]) {
                routes[routePath] = [];
              }
              routes[routePath].push({
                name: [r, a].join('.'),
                method: method,
                handler: routeHandler(def, r, a, require(implPath))
              });
            }
          }
        });
        Object.keys(routes).sort().reverse().forEach(function (routePath) {
          routes[routePath].forEach(function (route) {
            debug('routing %s for %s', routePath, route.name);
            server.opts(routePath, cors.preflight());
            server[route.method](routePath, cors.headers(), route.handler);
          });
        });
        return q.resolve();
      })
      .then(function () {
        server.on('after', restify.auditLogger({
          log: bunyan.createLogger({
            name: 'audit',
            stream: process.stdout
          })
        }));

        server.listen(
          config.get('port'),
          config.get('host'),
          function () {
            debug('%s listening at %s', server.name, server.url);
          }
        );
      }).catch(function (err) {
        console.log(err.stack);
      });
  },

  stop: function () {
    debug('stopping server');
    server.close();
  }

};
