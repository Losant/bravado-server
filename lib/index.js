import restify from 'restify';
import bunyan from 'bunyan';
import _debug from 'debug';
const debug = _debug('bravado:server');
import path from 'path';
import { readFileSync } from 'fs';
import * as url from 'url';
const __dirname = url.fileURLToPath(new URL('.', import.meta.url));
const packageJson = JSON.parse(readFileSync(path.resolve(__dirname, '../package.json')));
import config from './config.js';
import bravado from 'bravado-core';
import cors from './cors.js';
import routeHandler from './route.js';
import indexRouteHandler from './index-route.js';
import omnibelt from 'omnibelt';
const { forEachSerialP, keys, defer } = omnibelt;

let server;
let logger = () => {};
const defaultErrorTransform = (err) => {
  const message = ('string' === typeof err) ? err : err.message;
  return {
    code: err.statusCode || 500,
    body: { type: err.type || 'Error', message }
  };
};

const findExpectedHeaders = (params) => {
  const result = [];
  if (params) {
    params.forEach((param) => {
      if (param.in === 'header' && !param.private) { result.push(param.name); }
    });
  }
  return result;
};

const buildApis = async (apis) => {
  const defs = [];
  debug('loading api definition %s', apis);
  if (!Array.isArray(apis)) {
    apis = [apis];
  }
  await forEachSerialP(async (item) => {
    let builtApi;
    if ('string' === typeof item) {
      builtApi = await bravado.ApiDefinition.build(item);
    } else {
      builtApi = await bravado.ApiDefinition.build(item.root, {
        resourceDir: item.resourceDir,
        definitionDir: item.definitionDir,
        exampleDir: item.exampleDir
      });
    }
    defs.push([builtApi, await builtApi.resolveRefs()]);
  }, apis);
  return defs;
};


export const start = async function(apis, options = {}) {
  debug('starting server');
  if (options) {
    config.load(options);
    config.validate({ allowed: 'strict' });
  }

  const errorTransform = options.errorTransform || defaultErrorTransform;

  const serverOptions = {
    name: config.get('name'),
    version: packageJson.version,
    ignoreTrailingSlash: true,
    maxParamLength: options.maxParamLength || 100,
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

  const defs = await buildApis(apis);
  const routes = {};
  await forEachSerialP(async (def) => {
    const api = def[0];
    const resolved = def[1];
    api.validate();

    const apiExpectedHeaders = findExpectedHeaders(api.params);
    const resourcePath = path.resolve(path.dirname(api['x-bravado-sourceFile']), config.get('path'));
    await forEachSerialP(async (r) => {
      const resource = api.resources[r];
      const resourceExpectedHeaders = findExpectedHeaders(resource.params).concat(apiExpectedHeaders);
      const controllerPath = path.resolve(resourcePath, resource['x-bravado-controller']);
      await forEachSerialP(async (a) => {
        const action = resource.actions[a];
        const actionExpectedHeaders = findExpectedHeaders(action.params).concat(resourceExpectedHeaders);

        let method = action.method.toLowerCase();
        if (method === 'delete') { method = 'del'; }
        if (method === 'options') { method = 'opts'; }

        const fullPath = action['x-bravado-fullPath'];
        const routePath = fullPath.replace(/\{((?:[\w.~-]|(?:%[0-9A-F]{2}))+)\}/g, ':$1');
        if (!routes[routePath]) { routes[routePath] = []; }
        let controller = (await import(controllerPath));
        if (controller.default) {
          controller = controller.default;
        }
        routes[routePath].push({
          name: [r, a].join('.'),
          method,
          version: api.info.version,
          expectedHeaders: actionExpectedHeaders,
          handler: routeHandler(resolved, r, a, controller, options.context, errorTransform)
        });
      }, keys(resource.actions));
    }, keys(api.resources));
    routes[api.basePath] = [{
      name: 'index',
      method: 'get',
      version: api.info.version,
      handler: indexRouteHandler(api)
    }];
  }, defs);

  const extraHeaders = new Set();
  keys(routes).forEach((routePath) => {
    routes[routePath].forEach((action) => {
      (action.expectedHeaders || []).forEach((header) => { extraHeaders.add(header); });
      debug('routing %s@%s for %s', routePath, action.version, action.name);
      server[action.method](
        { path: routePath, version: action.version },
        cors.headers(),
        action.handler
      );
    });
  });
  server.opts('/*', cors.preflight({ extraHeaders }));

  server.on('after', function(req, res, route, err) {
    logger(req, res, route, err);
  });
  server.on('NotFound', function(req, res, err, cb) {
    res.json(404, { type: 'NotFound', message: err.message });
    cb();
  });
  server.on('MethodNotAllowed', function(req, res, err, cb) {
    res.json(405, { type: 'MethodNotAllowed', message: err.message });
    cb();
  });
  server.on('VersionNotAllowed', function(req, res, err, cb) {
    res.json(400, { type: 'VersionNotAllowed', message: err.message });
    cb();
  });
  server.on('InternalServer', function(req, res, err, cb) {
    const { code, body } = errorTransform(err);
    res.json(code, body);
    cb();
  });
  server.on('uncaughtException', function(req, res, route, err) {
    logger(req, res, route, err);
    if (!res.headersSent) {
      const { code, body } = errorTransform(err);
      res.json(code, body);
    }
  });

  const listenDefer = defer();
  server.listen(config.get('port'), config.get('host'), () => {
    debug('%s listening at %s', server.name, server.url);
    listenDefer.resolve();
  });

  await listenDefer.promise;
  return server;
};

export const stop = async function() {
  const closeDefer = defer();
  server.close(() => {
    debug('stopping server');
    closeDefer.resolve();
  });
  await closeDefer.promise;
};
