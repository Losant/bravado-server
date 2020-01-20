const restify = require('restify');
const bunyan = require('bunyan');
const debug = require('debug')('bravado:server');
const path = require('path');
const packageJson = require('../package.json');
const config = require('./config');
const bravado = require('bravado-core');
const cors = require('./cors');
const routeHandler = require('./route');
const indexRouteHandler = require('./index-route');
const { forEachSerialP, keys } = require('omnibelt');

let server;
let logger = () => {};

const findExpectedHeaders = (params) => {
  const result = [];
  if (params) {
    params.forEach(function(param) {
      if (param.in === 'header') { result.push(param.name); }
    });
  }
  return result;
};

const buildApis = async (apis) => {
  const defs = [];
  await forEachSerialP(async (item) => {
    let builtApi;
    if ('string' === typeof item) {
      builtApi = await bravado.ApiDefinition.build(item);
    }
    builtApi = await bravado.ApiDefinition.build(item.root, {
      resourceDir: item.resourceDir,
      definitionDir: item.definitionDir,
      exampleDir: item.exampleDir
    });
    defs.push([builtApi, await builtApi.resolveRefs()]);
  }, apis);
  return defs;
};

module.exports = {
  start: async function(apis, options) {
    debug('starting server');
    if (options) {
      config.load(options);
      config.validate({ allowed: 'strict' });
    }

    const serverOptions = {
      name: config.get('name'),
      version: packageJson.version,
      handleUncaughtExceptions: true  //deprecated, but without an equivalent alternative as of restify 8.5.1
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
    server.use(restify.plugins.queryParser({ mapParams: false }));
    server.use(restify.plugins.gzipResponse());
    server.use(restify.plugins.bodyParser({ mapParams: false, mapFiles: false }));

    // load api definitions
    debug('loading api definition %s', apis);
    if (!Array.isArray(apis)) {
      apis = [apis];
    }

    const defs = await buildApis(apis);
    const routes = {};
    defs.forEach((def) => {
      const api = def[0];
      const resolved = def[1];
      api.validate();

      const apiExpectedHeaders = findExpectedHeaders(api.params);
      const resourcePath = path.resolve(path.dirname(api['x-bravado-sourceFile']), config.get('path'));
      keys(api.resources).forEach((r) => {
        const resource = api.resources[r];
        const resourceExpectedHeaders = findExpectedHeaders(resource.params).concat(apiExpectedHeaders);
        const controllerPath = path.resolve(resourcePath, resource['x-bravado-controller']);

        keys(resource.actions).forEach((a) => {
          const action = resource.actions[a];
          const actionExpectedHeaders = findExpectedHeaders(action.params).concat(resourceExpectedHeaders);

          let method = action.method.toLowerCase();
          if (method === 'delete') { method = 'del'; }
          if (method === 'options') { method = 'opts'; }

          const fullPath = action['x-bravado-fullPath'];
          const routePath = fullPath.replace(/\{((?:[\w.~-]|(?:%[0-9A-F]{2}))+)\}/g, ':$1');
          if (!routes[routePath]) { routes[routePath] = []; }

          routes[routePath].push({
            name: [r, a].join('.'),
            method: method,
            version: api.info.version,
            expectedHeaders: actionExpectedHeaders,
            handler: routeHandler(resolved, r, a, require(controllerPath), options.context)
          });
        });
      });
      routes[api.basePath] = [{
        name: 'index',
        method: 'get',
        version: api.info.version,
        handler: indexRouteHandler(api)
      }];
    });

    keys(routes).forEach((routePath) => {
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
  },

  stop: function() {
    debug('stopping server');
    server.close();
  }

};
