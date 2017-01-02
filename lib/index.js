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

  start: function (apis, options) {
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
    debug('loading api definition %s', apis);
    if ('string' === typeof apis) {
      loadPromise = bravado.ApiDefinition.build(apis);
    } else if (Array.isArray(apis)) {
      loadPromise = q.all(apis.map(function (item) {
        return bravado.ApiDefinition.build(item);
      }));
    }

    return loadPromise
      .then(function (apis) {
        if (!Array.isArray(apis)) {
          apis = [apis];
        }
        return q.all(apis.map(function (api) {
          return q.all([api, api.resolveRefs()]);
        }));
      })
      .then(function (defs) {
        var routes = {};
        defs.forEach(function (def) {
          var api = def[0];
          var resolved = def[1];
          api.validate();

          var findExpectedHeaders = function(params){
            var result = [];
            if(params){
              params.forEach(function(param) {
                if(param.in === 'header')
                { result.push(param.name); }
              });
            }
            return result;
          };

          var apiExpectedHeaders = findExpectedHeaders(api.params);
          var resourcePath = path.resolve(path.dirname(api['x-bravado-sourceFile']), config.get('path'));
          for (var r in api.resources) {
            var resource = api.resources[r];
            var controllerPath = path.resolve(resourcePath, resource['x-bravado-controller']);
            var resourceExpectedHeaders = findExpectedHeaders(resource.params)
              .concat(apiExpectedHeaders);
            for (var a in resource.actions) {
              var action = resource.actions[a];
              var actionExpectedHeaders = findExpectedHeaders(action.params)
                .concat(resourceExpectedHeaders);
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
                version: api.info.version,
                expectedHeaders: actionExpectedHeaders,
                handler: routeHandler(resolved, r, a, require(controllerPath), options.context)
              });
            }
          }
          routes[api.basePath] = [{
            name: 'index',
            method: 'get',
            version: api.info.version,
            handler: indexRouteHandler(api)
          }];
        });
        Object.keys(routes).sort().reverse().forEach(function (routePath) {
          routes[routePath].forEach(function (route) {
            debug('routing %s@%s for %s', routePath, route.version, route.name);
            if(route.method !== 'opts'){
              server.opts(routePath,
                cors.preflight({ extraHeaders: route.expectedHeaders }));
            }
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

        return server;

      }).catch(function (err) {
        debug(err);
        throw err;
      });

  },

  stop: function () {
    debug('stopping server');
    server.close();
  }

};
