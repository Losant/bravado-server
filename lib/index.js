const restify = require('restify');
const bunyan = require('bunyan');
const q = require('q');
const debug = require('debug')('bravado:server');
const path = require('path');
const packageJson = require('../package.json');
const config = require('./config');
const bravado = require('bravado-core');
const cors = require('./cors');
const routeHandler = require('./route');
const indexRouteHandler = require('./index-route');

let server;
let logger = () => {};

module.exports = {
  start: function(apis, options) {
    debug('starting server');
    if (options) {
      config.load(options);
      config.validate({ allowed: 'strict' });
    }

    const serverOptions = {
      name: config.get('name'),
      version: packageJson.version
    };

    if (config.logRequests) {
      logger = restify.auditLogger({
        log: bunyan.createLogger({
          name: 'audit',
          stream: process.stdout
        })
      });
    }

    server = restify.createServer(serverOptions);
    server.use(restify.queryParser({ mapParams: false }));
    server.use(restify.gzipResponse());
    server.use(restify.bodyParser({
      mapParams: false,
      mapFiles: false
    }));

    // load api definitions
    debug('loading api definition %s', apis);
    if (!Array.isArray(apis)) {
      apis = [apis];
    }
    return q.all(apis.map(function(item) {
      if ('string' === typeof item) {
        return bravado.ApiDefinition.build(item);
      }
      return bravado.ApiDefinition.build(item.root, {
        resourceDir: item.resourceDir,
        definitionDir: item.definitionDir,
        exampleDir: item.exampleDir
      });
    }))
      .then(function(apisResult) {
        return q.all(apisResult.map(function(api) {
          return q.all([api, api.resolveRefs()]);
        }));
      })
      .then(function(defs) {
        const routes = {};
        defs.forEach(function(def) {
          const api = def[0];
          const resolved = def[1];
          api.validate();

          const findExpectedHeaders = function(params) {
            const result = [];
            if (params) {
              params.forEach(function(param) {
                if (param.in === 'header') { result.push(param.name); }
              });
            }
            return result;
          };

          const apiExpectedHeaders = findExpectedHeaders(api.params);
          const resourcePath = path.resolve(path.dirname(api['x-bravado-sourceFile']), config.get('path'));
          for (const r in api.resources) {
            const resource = api.resources[r];
            const controllerPath = path.resolve(resourcePath, resource['x-bravado-controller']);
            const resourceExpectedHeaders = findExpectedHeaders(resource.params)
              .concat(apiExpectedHeaders);
            for (const a in resource.actions) {
              const action = resource.actions[a];
              const actionExpectedHeaders = findExpectedHeaders(action.params)
                .concat(resourceExpectedHeaders);
              let method = action.method.toLowerCase();
              if (method === 'delete') { method = 'del'; }
              if (method === 'options') { method = 'opts'; }
              const fullPath = action['x-bravado-fullPath'];
              const routePath = fullPath.replace(/\{((?:[\w.~-]|(?:%[0-9A-F]{2}))+)\}/g, ':$1');
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
        Object.keys(routes).sort().reverse().forEach(function(routePath) {
          routes[routePath].forEach(function(route) {
            debug('routing %s@%s for %s', routePath, route.version, route.name);
            if (route.method !== 'opts') {
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
      .then(function() {
        server.on('after', function(req, res, route, err) {
          logger(req, res, route, err);
        });
        server.on('NotFound', function(req, res, err, cb) {
          res.send(404, { type: 'NotFound', message: err.message });
          cb();
        });
        server.on('MethodNotAllowed', function(req, res, err, cb) {
          res.send(405, { type: 'MethodNotAllowed', message: err.message });
          cb();
        });
        server.on('VersionNotAllowed', function(req, res, err, cb) {
          res.send(400, { type: 'VersionNotAllowed', message: err.message });
          cb();
        });
        server.on('InternalServer', function(req, res, err, cb) {
          res.send(500, { type: 'ServerError', message: err.message });
          cb();
        });
        server.on('uncaughtException', function(req, res, route, err) {
          logger(req, res, route, err);
          if (!res.headersSent) {
            res.send(err.statusCode || 500, { type: err.type || 'Error', message: err.message });
          }
        });

        server.listen(
          config.get('port'),
          config.get('host'),
          function() {
            debug('%s listening at %s', server.name, server.url);
          }
        );

        return server;

      }).catch(function(err) {
        debug(err);
        throw err;
      });

  },

  stop: function() {
    debug('stopping server');
    server.close();
  }

};
