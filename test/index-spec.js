import { start, stop } from '../lib/index.js';
import http from 'http';
import path from 'path';
import fs from 'fs-extra';
import nock from 'nock';
import * as url from 'url';
import clientGenerator from 'bravado-client-generator';
const __dirname = url.fileURLToPath(new URL('.', import.meta.url));
const testClientPath  = path.join(__dirname, 'testClient');
import 'should';

process.env.PORT = process.env.PORT || '56473';
process.env.HOST = process.env.HOST || '127.0.0.1';
process.env.NODE_ENV = 'test';
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
          return { code: err.statusCode, body: { type: err.type, message: err.message } };
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
    client = (await import(path.join(testClientPath, 'lib/index.js'))).createClient({ url: apiUrl });
  });

  after(() => {
    stop();
    nock.disableNetConnect();
  });

  it('Correctly set cors', async () => {
    const httpClient = http.request(`${apiUrl}/testApi/objectId/`, { method: 'OPTIONS' }, (res) => {
      res.headers.should.deepEqual({
        'server': 'Test API',
        'access-control-allow-headers': 'Accept,Content-Type,X-Amz-Date,Authorization,Accept-Version,guess,what,howdy,I,have,headers',
        'access-control-allow-methods': 'DELETE,GET,HEAD,OPTIONS,PATCH,POST,PUT',
        'access-control-allow-origin': '*',
        'date': res.headers.date,
        'connection': 'keep-alive',
        'keep-alive': 'timeout=5'
      });
    });
    httpClient.end();
    const httpClient2 = http.request(`${apiUrl}/anotherApi`, { method: 'OPTIONS' }, (res) => {
      res.headers.should.deepEqual({
        'server': 'Test API',
        'access-control-allow-origin': '*',
        'date': res.headers.date,
        'connection': 'keep-alive',
        'keep-alive': 'timeout=5'
      });
    });
    httpClient2.end();
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
      statusCode: 400, type: 'Validation', message: 'object has additional properties'
    });
    (await client.testApi.object({ object: {} }, {})).should.deepEqual({ object: {} });
    (await client.testApi.object({ object: { you: 'hi', me: 'ho' } }, {}))
      .should.deepEqual({ object: { you: 'hi', me: 'ho' } });
  });

  it('Correctly accept a file', async () => {
    await client.testApi.upload({ theFile: 'words' }, {}).should.be.resolvedWith({ content: 'words' });

    const localPath = `${__dirname}/testClient/test.txt`;
    await fs.writeFile(localPath, 'Howdy');
    const fileStream = fs.createReadStream(localPath);
    await client.testApi.upload({ theFile: fileStream }, {}).should.be.resolvedWith({ content: 'Howdy' });
    await fs.remove(localPath);
  });

  it('correctly transforms error result', async () => {
    await client.testApi.explode().should.be.rejectedWith({
      statusCode: 505, type: 'TransformedError', message: 'TransformedHello There'
    });
  });
});
