const { start, stop } = require('../lib/index');
require('should');
const clientGenerator = require('bravado-client-generator');
const path = require('path');
const fs = require('fs-extra');
const nock = require('nock');
const testClientPath  = path.join(__dirname, 'testClient');

process.env.PORT = process.env.PORT || '56473';
process.env.HOST = process.env.HOST || '127.0.0.1';
process.env.NODE_ENV = 'test';
const apiUrl = `http://${process.env.HOST}:${process.env.PORT}`;
process.env.API_URL = apiUrl;

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

  it('Correctly validate on API schema', async () => {
    await client.testApi.objectId({}, {}).should.be.rejectedWith('id is required');
    await client.testApi.objectId({ id: 'badID' }, {}).should.be.rejectedWith('id pattern mismatch');
    const result = await client.testApi.objectId({ id: '000000000000000000000000' }, {});
    result.should.deepEqual({ id: '000000000000000000000000' });
  });
});
