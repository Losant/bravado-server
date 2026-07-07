import { start, stop } from '../lib/index.js';
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

  before(async () => {
    nock.enableNetConnect(`${process.env.HOST}:${process.env.PORT}`);
    await start([{
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
      'connection': 'close',
      'vary': 'origin',
      'access-control-max-age': '86400'
    });
    resHeaders2.should.deepEqual({
      'server': 'Test API',
      'access-control-allow-origin': '*',
      'date': resHeaders2.date,
      'connection': 'close',
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
});
