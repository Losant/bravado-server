const convict = require('convict');

const conf = convict({
  name: {
    doc: 'Server name',
    format: String,
    default: 'Bravado Server'
  },
  host: {
    doc: 'Hostname of server',
    format: String,
    default: ''
  },
  port: {
    doc: 'Port of server',
    format: 'port',
    default: 8080
  },
  path: {
    doc: 'Path to resource implementations, relative to api definition',
    format: String,
    default: './resources'
  },
  context: {
    doc: 'Base context for resource controllers',
    format: Object,
    default: {}
  },
  logRequests: {
    doc: 'Should log requests',
    format: Boolean,
    default: true
  },
  errorTransform: {
    doc: 'Optional error transformer function',
    format: '*',
    default: null
  }
});

module.exports = conf;
