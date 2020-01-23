const { start, stop } = require('../lib/index');
const http = require('http');
const path = require('path');
const fs   = require('fs-extra');
const nock = require('nock');
const clientGenerator = require('bravado-client-generator');
const testClientPath  = path.join(__dirname, 'testClient');
require('should');

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
      host: process.env.HOST
    });
    await fs.remove(testClientPath);
    await fs.ensureDir(testClientPath);
    await clientGenerator({
      url: apiUrl,
      root: apiUrl,
      lang: 'js',
      output: testClientPath
    });
    client = await require(testClientPath).createClient({ url: apiUrl });
  });

  after(() => {
    stop();
    nock.disableNetConnect();
  });

  it('Correctly set options for the base route', async () => {
    const httpClient = http.request(`${apiUrl}/testApi/objectId/`, { method: 'OPTIONS' }, (res) => {
      res.headers.should.deepEqual({
        'server': 'Test API',
        'access-control-allow-headers': 'Accept,Content-Type,X-Amz-Date,Authorization,Accept-Version,guess,what,howdy,partner,I,have,headers',
        'access-control-allow-methods': 'OPTIONS,GET,PATCH,POST',
        'access-control-allow-origin': '*',
        'date': res.headers.date,
        'connection': 'close'
      });
    });
    httpClient.end();
  });

  it('Correctly accept an objectId', async () => {
    await client.testApi.objectId({}, {}).should.be.rejectedWith('id is required');
    await client.testApi.objectId({ id: 'badID' }, {}).should.be.rejectedWith('id pattern mismatch');
    (await client.testApi.objectId({ id: oid }, {})).should.deepEqual({ id: oid });
  });

  it('Correctly accept an array', async () => {
    await client.testApi.objectIds({ ids: ['badId'] }, {}).should.be.rejectedWith('ids.0 pattern mismatch');
    await client.testApi.objectIds({ ids: [oid, oid, oid, oid] }, {}).should.be.rejectedWith('ids has more items than allowed');
    (await client.testApi.objectIds({ ids: [oid, oid, oid] }, {})).should.deepEqual({ ids: [oid, oid, oid] });
  });

  it('Correctly accept datetime format', async () => {
    await client.testApi.date({ date: '2020' }, {}).should.be.rejectedWith('date must be date-time format');
    (await client.testApi.date({ date: '2020-01-20T15:19:01Z' }, {})).should.deepEqual({ date: '2020-01-20T15:19:01Z' });
  });

  it('Correctly accept an object', async () => {
    await client.testApi.object({ object: { us: 5 } }, {}).should.be.rejectedWith('object has additional properties');
    (await client.testApi.object({ object: {} }, {})).should.deepEqual({ object: {} });
    (await client.testApi.object({ object: { you: 'hi', me: 'ho' } }, {})).should.deepEqual({ object: { you: 'hi', me: 'ho' } });
  });

  it('Correctly accept a file', async () => {
    await fs.writeFile(`${__dirname}/testClient/test.txt`, 'Howdy');
    const fileStream = fs.createReadStream(`${__dirname}/testClient/test.txt`);

    await client.testApi.upload({ theFile: 'howdy' }, {}).should.be.rejectedWith('theFile is not a valid file');
    await client.testApi.upload({ theFile: fileStream }, {});
  });
});
