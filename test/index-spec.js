import { start, stop } from '../lib/index.js';
import routeHandler from '../lib/route.js';
import { EventEmitter } from 'events';
import http from 'http';
import path from 'path';
import fs from 'fs-extra';
import nock from 'nock';
import * as url from 'url';
import clientGenerator from 'bravado-client-generator';
import { defer } from 'omnibelt';
import { promisify } from 'node:util';
import { exec } from 'node:child_process';
const execP = promisify(exec);
const __dirname = url.fileURLToPath(new URL('.', import.meta.url));
const testClientPath  = path.join(__dirname, 'testClient');
import 'should';

process.env.PORT = process.env.PORT || '56473';
process.env.HOST = process.env.HOST || '127.0.0.1';
process.env.NODE_ENV = 'test';
process.env.JWT_ALGO = process.env.JWT_ALGO || 'HS256';
const apiUrl = `http://${process.env.HOST}:${process.env.PORT}`;

const oid = '000000000000000000000000';

describe('Index', async () => {
  let client;
  let server;

  before(async () => {
    nock.enableNetConnect(`${process.env.HOST}:${process.env.PORT}`);
    server = await start([{
      root: path.join(__dirname, 'testApi')
    }], {
      name: 'Test API',
      port: process.env.PORT,
      host: process.env.HOST,
      maxParamLength: 250,
      errorTransform: (err) => {
        if (err.statusCode) {
          const body = { type: err.type, message: err.message };
          if (err.validationErrors) { body.validationErrors = err.validationErrors; }
          return { code: err.statusCode, body };
        } else {
          return { code: 505, body: { type: `Transformed${err.name}`, message: `Transformed${err.message}` } };
        }
      }
    });
    await fs.remove(testClientPath);
    await fs.ensureDir(testClientPath);
    await clientGenerator({
      url: apiUrl,
      root: apiUrl,
      lang: 'js',
      output: testClientPath
    });
    await execP('pnpm install --ignore-workspace', { cwd: testClientPath });
    client = (await import(path.join(testClientPath, 'lib/index.js'))).createClient({ url: apiUrl });
  });

  after(() => {
    stop();
    nock.disableNetConnect();
  });

  it('Correctly set cors', async () => {
    const waitToClose = defer();
    const httpClient = http.request(`${apiUrl}/testApi/objectId/`, { method: 'OPTIONS', headers: { origin: 'foo.com' } }, (res) => {
      waitToClose.resolve(res.headers);
    });
    httpClient.end();
    const resHeaders = await waitToClose.promise;
    const waitToClose2 = defer();
    const httpClient2 = http.request(`${apiUrl}/anotherApi`, { method: 'OPTIONS' }, (res) => {
      waitToClose2.resolve(res.headers);
    });
    httpClient2.end();
    const resHeaders2 = await waitToClose2.promise;
    resHeaders.should.deepEqual({
      'server': 'Test API',
      'access-control-allow-headers': 'Accept,Content-Type,X-Amz-Date,Authorization,Accept-Version,guess,what,howdy,I,have,headers',
      'access-control-allow-methods': 'DELETE,GET,HEAD,OPTIONS,PATCH,POST,PUT',
      'access-control-allow-origin': 'foo.com',
      'date': resHeaders.date,
      'connection': 'keep-alive',
      'keep-alive': 'timeout=5',
      'vary': 'origin',
      'access-control-max-age': '86400'
    });
    resHeaders2.should.deepEqual({
      'server': 'Test API',
      'access-control-allow-origin': '*',
      'date': resHeaders2.date,
      'connection': 'keep-alive',
      'keep-alive': 'timeout=5',
      'vary': 'origin'
    });
  });

  it('Correctly accept an objectId', async () => {
    await client.testApi.objectId({}, {}).should.be.rejectedWith({
      statusCode: 400, type: 'Validation', message: 'id is required'
    });
    await client.testApi.objectId({ id: 'badID' }, {}).should.be.rejectedWith({
      statusCode: 400, type: 'Validation', message: 'id pattern mismatch'
    });
    (await client.testApi.objectId({ id: oid }, {})).should.deepEqual({ id: oid });
  });

  it('Correctly accept an array', async () => {
    await client.testApi.objectIds({ ids: ['badId'] }, {}).should.be.rejectedWith({
      statusCode: 400, type: 'Validation', message: 'ids.0 pattern mismatch'
    });
    await client.testApi.objectIds({ ids: [oid, oid, oid, oid] }, {}).should.be.rejectedWith({
      statusCode: 400, type: 'Validation', message: 'ids has more items than allowed'
    });
    (await client.testApi.objectIds({ ids: [oid, oid, oid] }, {}))
      .should.deepEqual({ ids: [oid, oid, oid] });
  });

  it('Correctly accept datetime format', async () => {
    await client.testApi.date({ date: '2020' }, {}).should.be.rejectedWith({
      statusCode: 400, type: 'Validation', message: 'date must be date-time format'
    });
    (await client.testApi.date({ date: '2020-01-20T15:19:01Z' }, {}))
      .should.deepEqual({ date: '2020-01-20T15:19:01Z' });
  });

  it('Correctly accept an object', async () => {
    await client.testApi.object({ object: { us: 5 } }, {}).should.be.rejectedWith({
      statusCode: 400, type: 'Validation', message: 'object.us is an additional property'
    });
    (await client.testApi.object({ object: {} }, {})).should.deepEqual({ object: {} });
    (await client.testApi.object({ object: { you: 'hi', me: 'ho' } }, {}))
      .should.deepEqual({ object: { you: 'hi', me: 'ho' } });
  });

  it('Correctly accept a file', async () => {
    await client.testApi.upload({}, {}).should.be.rejectedWith({
      statusCode: 400, type: 'Validation', message: 'theFile is required'
    });
    await client.testApi.upload({ theFile: 'words' }, {}).should.be.resolvedWith({ content: 'words' });

    const localPath = `${__dirname}/testClient/test.txt`;
    await fs.writeFile(localPath, 'Howdy');
    const fileStream = fs.createReadStream(localPath);
    await client.testApi.upload({ theFile: fileStream }, {}).should.be.resolvedWith({ content: 'Howdy' });
    await fs.remove(localPath);
  });

  it('Returns multiple validation errors via validationErrors', async () => {
    let err;
    try {
      await client.testApi.shape({ shape: { type: 'rectangle' } }, {});
    } catch (e) {
      err = e;
    }
    err.statusCode.should.equal(400);
    err.message.should.equal('shape.width is required');
    err.validationErrors.should.deepEqual([
      { field: 'shape.width', validationMessage: 'is required' },
      { field: 'shape.height', validationMessage: 'is required' }
    ]);
  });

  it('Correctly validates recursive schemas', async () => {
    // nested op field has wrong type — previously a silent no-op under is-my-json-valid
    await client.testApi.queryFilter({ query: { $and: [{ op: 123 }] } }, {}).should.be.rejectedWith({
      statusCode: 400, type: 'Validation', message: 'query.$and.0.op is the wrong type'
    });
    // valid flat filter
    (await client.testApi.queryFilter({ query: { field: 'name', op: 'eq' } }, {}))
      .should.deepEqual({ query: { field: 'name', op: 'eq' } });
    // valid nested filter
    (await client.testApi.queryFilter({ query: { $and: [{ field: 'age', op: 'gt' }, { field: 'status', op: 'eq' }] } }, {}))
      .should.deepEqual({ query: { $and: [{ field: 'age', op: 'gt' }, { field: 'status', op: 'eq' }] } });
  });

  it('Correctly handles oneOf with discriminator', async () => {
    await client.testApi.shape({ shape: { type: 'circle', radius: 'oops' } }, {}).should.be.rejectedWith({
      statusCode: 400, type: 'Validation', message: 'shape.radius is the wrong type'
    });
    await client.testApi.shape({ shape: { type: 'triangle' } }, {}).should.be.rejectedWith({
      statusCode: 400, type: 'Validation', message: 'shape has unknown type "triangle"'
    });
    await client.testApi.shape({ shape: {} }, {}).should.be.rejectedWith({
      statusCode: 400, type: 'Validation', message: 'shape is missing required type'
    });
    (await client.testApi.shape({ shape: { type: 'circle', radius: 5 } }, {}))
      .should.deepEqual({ shape: { type: 'circle', radius: 5 } });
    (await client.testApi.shape({ shape: { type: 'rectangle', width: 3, height: 4 } }, {}))
      .should.deepEqual({ shape: { type: 'rectangle', width: 3, height: 4 } });
  });

  it('correctly transforms error result', async () => {
    await client.testApi.explode().should.be.rejectedWith({
      statusCode: 505, type: 'TransformedError', message: 'TransformedHello There'
    });
  });

  describe('server error event listeners with headersSent', () => {
    const errorEvents = [
      { event: 'NotFound', expectedCode: 404, expectedType: 'NotFound' },
      { event: 'MethodNotAllowed', expectedCode: 405, expectedType: 'MethodNotAllowed' },
      { event: 'VersionNotAllowed', expectedCode: 400, expectedType: 'VersionNotAllowed' },
      { event: 'InternalServer', expectedCode: 505, expectedType: 'TransformedError' }
    ];

    errorEvents.forEach(({ event, expectedCode, expectedType }) => {
      it(`does not call res.json on ${event} when res.headersSent is true`, (done) => {
        let jsonCalled = false;
        const fakeRes = {
          headersSent: true,
          json: () => { jsonCalled = true; }
        };
        server.emit(event, {}, fakeRes, new Error('test error'), () => {
          jsonCalled.should.equal(false);
          done();
        });
      });

      it(`calls res.json on ${event} when res.headersSent is false`, (done) => {
        let responseCode;
        let responseBody;
        const fakeRes = {
          headersSent: false,
          json: (code, body) => {
            responseCode = code;
            responseBody = body;
          }
        };
        server.emit(event, {}, fakeRes, new Error('test error'), () => {
          responseCode.should.equal(expectedCode);
          responseBody.type.should.equal(expectedType);
          done();
        });
      });
    });
  });

  describe('route error handling with headersSent', () => {
    const errorTransform = (err) => ({
      code: 500,
      body: { type: err.name, message: err.message }
    });

    it('does not call res.json or next on route error if res.headersSent is true', async () => {
      const api = server.bravadoApiDefinition[0];
      let jsonCalls = 0;
      let nextCalls = 0;
      const testError = new Error('route failure');

      const handler = routeHandler(api, 'testApi', 'getTest', {
        getTest: (params, context) => {
          context.fail(testError);
        }
      }, {}, errorTransform);

      const req = {
        method: 'GET',
        connection: { remoteAddress: '127.0.0.1' },
        id: () => 'test-id',
        params: {},
        query: {},
        headers: {}
      };
      const res = {
        headersSent: true,
        json: () => { jsonCalls++; }
      };
      const next = () => { nextCalls++; };

      await new Promise((resolve) => {
        handler(req, res, next);
        setImmediate(resolve);
      });

      jsonCalls.should.equal(0);
      nextCalls.should.equal(0);
      res.caughtError.should.equal(testError);
    });

    it('calls res.json and next on route error if res.headersSent is false', async () => {
      const api = server.bravadoApiDefinition[0];
      let jsonArgs = null;
      let nextCalls = 0;
      const testError = new Error('route failure');

      const handler = routeHandler(api, 'testApi', 'getTest', {
        getTest: (params, context) => {
          context.fail(testError);
        }
      }, {}, errorTransform);

      const req = {
        method: 'GET',
        connection: { remoteAddress: '127.0.0.1' },
        id: () => 'test-id',
        params: {},
        query: {},
        headers: {}
      };
      const res = {
        headersSent: false,
        json: (code, body) => { jsonArgs = { code, body }; }
      };
      const next = () => { nextCalls++; };

      await new Promise((resolve) => {
        handler(req, res, next);
        setImmediate(resolve);
      });

      jsonArgs.should.deepEqual({
        code: 500,
        body: { type: 'Error', message: 'route failure' }
      });
      nextCalls.should.equal(1);
      res.caughtError.should.equal(testError);
    });

    it('does not double-respond or call next twice if context.fail is called again after headers are sent', async () => {
      const api = server.bravadoApiDefinition[0];
      let jsonCalls = 0;
      let nextCalls = 0;
      const testError1 = new Error('first failure');
      const testError2 = new Error('second failure');

      const handler = routeHandler(api, 'testApi', 'getTest', {
        getTest: (params, context) => {
          context.fail(testError1);
        }
      }, {}, errorTransform);

      const req = {
        method: 'GET',
        connection: { remoteAddress: '127.0.0.1' },
        id: () => 'test-id',
        params: {},
        query: {},
        headers: {}
      };
      const res = {
        headersSent: false,
        json: () => {
          jsonCalls++;
          res.headersSent = true;
        }
      };
      const next = () => { nextCalls++; };

      await new Promise((resolve) => {
        handler(req, res, next);
        setImmediate(resolve);
      });

      jsonCalls.should.equal(1);
      nextCalls.should.equal(1);
      res.caughtError.should.equal(testError1);

      // If context.committed was not applied and fail is called again when headers are sent
      res._bravado.context.committed = false;
      res._bravado.context.fail(testError2);

      jsonCalls.should.equal(1);
      nextCalls.should.equal(1);
      res.caughtError.should.equal(testError2);
    });
  });

  describe('SSE stream handling', () => {
    it('sets Content-Type to text/event-stream, flushes headers, and calls next() immediately', async () => {
      const api = server.bravadoApiDefinition[0];
      const streamEmitter = new EventEmitter();
      let headerName;
      let headerVal;
      let flushedHeaders = false;
      let nextCalled = false;

      const handler = routeHandler(api, 'testApi', 'getTest', {
        getTest: (params, context) => {
          context.succeed(streamEmitter);
        }
      }, {}, () => ({ code: 500, body: {} }));

      const connection = new EventEmitter();
      connection.remoteAddress = '127.0.0.1';
      const req = {
        method: 'GET',
        connection,
        id: () => 'test-id',
        params: {},
        query: {},
        headers: {}
      };
      const res = {
        header: (name, val) => {
          headerName = name;
          headerVal = val;
        },
        flushHeaders: () => {
          flushedHeaders = true;
        },
        write: () => {},
        end: () => {}
      };
      const next = () => { nextCalled = true; };

      await new Promise((resolve) => {
        handler(req, res, next);
        setImmediate(resolve);
      });

      headerName.should.equal('Content-Type');
      headerVal.should.equal('text/event-stream');
      flushedHeaders.should.equal(true);
      nextCalled.should.equal(true);
    });

    it('formats and writes event, comment, and ping messages', async () => {
      const api = server.bravadoApiDefinition[0];
      const streamEmitter = new EventEmitter();
      const writes = [];

      const handler = routeHandler(api, 'testApi', 'getTest', {
        getTest: (params, context) => {
          context.succeed(streamEmitter);
        }
      }, {}, () => ({ code: 500, body: {} }));

      const connection = new EventEmitter();
      connection.remoteAddress = '127.0.0.1';
      const req = {
        method: 'GET',
        connection,
        id: () => 'test-id',
        params: {},
        query: {},
        headers: {}
      };
      const res = {
        header: () => {},
        flushHeaders: () => {},
        write: (data) => { writes.push(data); },
        end: () => {}
      };

      await new Promise((resolve) => {
        handler(req, res, () => {});
        setImmediate(resolve);
      });

      streamEmitter.emit('event', {
        event: 'update',
        data: { message: 'hello' },
        id: '123',
        retry: 5000
      });
      writes.should.deepEqual([
        'event: update\ndata: {"message":"hello"}\nid: 123\nretry: 5000\n\n'
      ]);

      streamEmitter.emit('comment', 'a comment');
      writes.should.deepEqual([
        'event: update\ndata: {"message":"hello"}\nid: 123\nretry: 5000\n\n',
        ':a comment\n\n'
      ]);

      streamEmitter.emit('ping');
      writes.should.deepEqual([
        'event: update\ndata: {"message":"hello"}\nid: 123\nretry: 5000\n\n',
        ':a comment\n\n',
        ':\n\n'
      ]);
    });

    it('ends response and removes listeners on close and error events', async () => {
      const api = server.bravadoApiDefinition[0];
      const streamEmitter = new EventEmitter();
      let endCalled = false;

      const handler = routeHandler(api, 'testApi', 'getTest', {
        getTest: (params, context) => {
          context.succeed(streamEmitter);
        }
      }, {}, () => ({ code: 500, body: {} }));

      const connection = new EventEmitter();
      connection.remoteAddress = '127.0.0.1';
      const req = {
        method: 'GET',
        connection,
        id: () => 'test-id',
        params: {},
        query: {},
        headers: {}
      };
      const res = {
        header: () => {},
        flushHeaders: () => {},
        write: () => {},
        end: () => { endCalled = true; }
      };

      await new Promise((resolve) => {
        handler(req, res, () => {});
        setImmediate(resolve);
      });

      streamEmitter.listenerCount('event').should.be.above(0);
      streamEmitter.emit('close');
      endCalled.should.equal(true);
      streamEmitter.listenerCount('event').should.equal(0);
    });

    it('disables gzip if res.handledGzip exists', async () => {
      const api = server.bravadoApiDefinition[0];
      const streamEmitter = new EventEmitter();
      let handledGzipCalled = false;
      let contentEncodingHeader = false;

      const handler = routeHandler(api, 'testApi', 'getTest', {
        getTest: (params, context) => {
          context.succeed(streamEmitter);
        }
      }, {}, () => ({ code: 500, body: {} }));

      const connection = new EventEmitter();
      connection.remoteAddress = '127.0.0.1';
      const req = {
        method: 'GET',
        connection,
        id: () => 'test-id',
        params: {},
        query: {},
        headers: {}
      };
      const res = {
        header: () => {},
        flushHeaders: () => {},
        handledGzip: () => { handledGzipCalled = true; },
        setHeader: (name, val) => {
          if (name === 'Content-Encoding' && val === null) {
            contentEncodingHeader = true;
          }
        },
        write: () => {},
        end: () => {}
      };

      await new Promise((resolve) => {
        handler(req, res, () => {});
        setImmediate(resolve);
      });

      handledGzipCalled.should.equal(true);
      contentEncodingHeader.should.equal(true);
    });

    it('serves SSE end-to-end, tracks inflight requests, and fires after event on stream end', async () => {
      const api = server.bravadoApiDefinition[0];
      const streamEmitter = new EventEmitter();
      const sseHandler = routeHandler(api, 'testApi', 'getTest', {
        getTest: (params, context) => {
          context.succeed(streamEmitter);
        }
      }, {}, () => ({ code: 500, body: {} }));

      server.get('/testSseStream', sseHandler);

      let afterFired = false;
      const onAfter = (req, res, route) => {
        if (route && route.path === '/testSseStream') {
          afterFired = true;
        }
      };
      server.on('after', onAfter);

      const inflightBefore = server.inflightRequests();
      const chunks = [];
      const doneDefer = defer();

      const httpClient = http.request(`${apiUrl}/testSseStream`, { method: 'GET' }, (res) => {
        res.statusCode.should.equal(200);
        res.headers['content-type'].should.equal('text/event-stream');
        res.on('data', (chunk) => {
          chunks.push(chunk.toString());
        });
        res.on('end', () => {
          doneDefer.resolve();
        });
      });
      httpClient.end();

      // Wait for stream to establish and verify inflight request counter
      await new Promise((resolve) => setTimeout(resolve, 50));
      server.inflightRequests().should.equal(inflightBefore + 1);
      afterFired.should.equal(false);

      // Emit an event and comment
      streamEmitter.emit('event', { data: { text: 'hello sse' } });
      streamEmitter.emit('comment', 'keepalive');

      // Close the stream from the server side
      await new Promise((resolve) => setTimeout(resolve, 50));
      streamEmitter.emit('close');

      await doneDefer.promise;

      chunks.join('').should.equal('data: {"text":"hello sse"}\n\n:keepalive\n\n');

      // Inflight requests should have decremented and after event emitted
      await new Promise((resolve) => setTimeout(resolve, 50));
      server.inflightRequests().should.equal(inflightBefore);
      afterFired.should.equal(true);
    });

    it('decrements inflight requests and fires after event when client disconnects prematurely', async () => {
      const api = server.bravadoApiDefinition[0];
      const streamEmitter = new EventEmitter();
      const sseHandler = routeHandler(api, 'testApi', 'getTest', {
        getTest: (params, context) => {
          context.succeed(streamEmitter);
        }
      }, {}, () => ({ code: 500, body: {} }));

      server.get('/testSseAbort', sseHandler);

      let afterFired = false;
      const onAfter = (req, res, route) => {
        if (route && route.path === '/testSseAbort') {
          afterFired = true;
        }
      };
      server.on('after', onAfter);

      const inflightBefore = server.inflightRequests();

      const httpClient = http.request(`${apiUrl}/testSseAbort`, { method: 'GET' }, (res) => {
        res.statusCode.should.equal(200);
        // Abort connection as soon as we receive response headers
        httpClient.destroy();
      });
      httpClient.end();

      // Wait for server to detect disconnection and finalize request-response cycle
      await new Promise((resolve) => setTimeout(resolve, 100));

      server.inflightRequests().should.equal(inflightBefore);
      afterFired.should.equal(true);
    });

    it('cleans up response and calls next() without attaching listeners if connection is already destroyed', async () => {
      const api = server.bravadoApiDefinition[0];
      const streamEmitter = new EventEmitter();
      let nextCalled = false;
      let headersSet = false;
      let tornDown = false;

      const cleanup = (event) => {
        if (event !== 'event' || streamEmitter.listenerCount('event') !== 0) { return; }
        streamEmitter.removeListener('removeListener', cleanup);
        tornDown = true;
      };
      streamEmitter.on('removeListener', cleanup);

      const handler = routeHandler(api, 'testApi', 'getTest', {
        getTest: (params, context) => {
          context.succeed(streamEmitter);
        }
      }, {}, () => ({ code: 500, body: {} }));

      const connection = new EventEmitter();
      connection.remoteAddress = '127.0.0.1';
      connection.destroyed = true;
      const req = {
        method: 'GET',
        connection,
        id: () => 'test-id',
        params: {},
        query: {},
        headers: {}
      };
      const res = {
        destroyed: true,
        header: () => { headersSet = true; },
        flushHeaders: () => {},
        write: () => {},
        end: () => {}
      };

      streamEmitter.on('custom', () => {});
      streamEmitter.listenerCount('custom').should.equal(1);

      await new Promise((resolve) => {
        handler(req, res, () => {
          nextCalled = true;
          resolve();
        });
      });

      nextCalled.should.equal(true);
      headersSet.should.equal(false);
      tornDown.should.equal(true);
      streamEmitter.listenerCount('event').should.equal(0);
      streamEmitter.listenerCount('custom').should.equal(0);
    });

    it('handles client dropping connection before _done attaches req.connection close listener', async () => {
      const api = server.bravadoApiDefinition[0];
      const streamEmitter = new EventEmitter();
      const doneDefer = defer();
      let tornDown = false;

      const cleanup = (event) => {
        if (event !== 'event' || streamEmitter.listenerCount('event') !== 0) { return; }
        streamEmitter.removeListener('removeListener', cleanup);
        tornDown = true;
      };
      streamEmitter.on('removeListener', cleanup);

      const sseHandler = routeHandler(api, 'testApi', 'getTest', {
        getTest: (params, context) => {
          setTimeout(() => {
            context.succeed(streamEmitter);
            doneDefer.resolve();
          }, 60);
        }
      }, {}, () => ({ code: 500, body: {} }));

      server.get('/testSseEarlyAbort', sseHandler);

      let afterFired = false;
      const onAfter = (req, res, route) => {
        if (route && route.path === '/testSseEarlyAbort') {
          afterFired = true;
        }
      };
      server.on('after', onAfter);

      const inflightBefore = server.inflightRequests();

      const httpClient = http.request(`${apiUrl}/testSseEarlyAbort`, { method: 'GET' });
      httpClient.on('error', () => {});
      httpClient.end();

      // Client drops the connection early, while controller is still pending
      await new Promise((resolve) => setTimeout(resolve, 15));
      httpClient.destroy();

      // Wait for controller to finish and call context.succeed
      await doneDefer.promise;

      // Allow Restify lifecycle to complete
      await new Promise((resolve) => setTimeout(resolve, 50));

      tornDown.should.equal(true);
      streamEmitter.listenerCount('event').should.equal(0);
      streamEmitter.listenerCount('comment').should.equal(0);
      streamEmitter.listenerCount('ping').should.equal(0);
      streamEmitter.listenerCount('close').should.equal(0);
      streamEmitter.listenerCount('error').should.equal(0);

      server.inflightRequests().should.equal(inflightBefore);
      afterFired.should.equal(true);
    });
  });
});
