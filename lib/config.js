var convict = require('convict');

var conf = convict({
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
    doc: 'Path to resource implemenations, relative to api definition',
    format: String,
    default: './resources'
  },
  context: {
    doc: 'Base context for resource controllers',
    format: Object,
    default: {}
  }
});

module.exports = conf;
