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
var indexRouteHandler = require('./index-route');

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
        return bravado.ApiDefinition.load(item);
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
          var resourcePath = path.resolve(path.dirname(def['x-bravado-sourceFile']), config.get('path'));
          for (var r in def.resources) {
            var resource = def.resources[r];
            var controllerPath = path.resolve(resourcePath, resource['x-bravado-controller']);
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
                version: def.info.version,
                handler: routeHandler(def, r, a, require(controllerPath), options.context)
              });
            }
          }
          routes[def.basePath] = [{
            name: 'index',
            method: 'get',
            version: def.info.version,
            handler: indexRouteHandler(def)
          }];
        });
        Object.keys(routes).sort().reverse().forEach(function (routePath) {
          routes[routePath].forEach(function (route) {
            debug('routing %s@%s for %s', routePath, route.version, route.name);
            server.opts(routePath, cors.preflight());
            server[route.method](
              { path: routePath, version: route.version },
              cors.headers(),
              route.handler
            );
          });
        });
        return q.resolve();
      })
      .then(function () {
        var logger = restify.auditLogger({
          log: bunyan.createLogger({
            name: 'audit',
            stream: process.stdout
          })
        });
        server.on('after', function (req, res, route, err) {
          logger(req, res, route, err);
        });
        server.on('NotFound', function (req, res, err, cb) {
          res.send(404, { type: 'NotFound', message: err.message });
          cb();
        });
        server.on('MethodNotAllowed', function (req, res, err, cb) {
          res.send(405, { type: 'MethodNotAllowed', message: err.message });
          cb();
        });
        server.on('VersionNotAllowed', function (req, res, err, cb) {
          res.send(400, { type: 'VersionNotAllowed', message: err.message });
          cb();
        });
        server.on('InternalServer', function (req, res, err, cb) {
          res.send(500, { type: 'ServerError', message: err.message });
          cb();
        });
        server.on('uncaughtException', function (req, res, route, err) {
          logger(req, res, route, err);
          res.send(err.statusCode || 500, { type: err.type || 'Error', message: err.message });
        });

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
