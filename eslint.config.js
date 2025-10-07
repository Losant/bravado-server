import nodeConfig from '@losant/eslint-config-losant/env/node.js';

export default [
  {
    ignores: [
      'node_modules',
      'test/testClient'
    ]
  },
  ...nodeConfig
];
