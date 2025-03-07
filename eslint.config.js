import nodeConfig from '@losant/eslint-config-losant/env/node.js';

export default [
  {
    ignores: [
      '.yarn',
      'node_modules',
      'test/testClient'
    ]
  },
  ...nodeConfig
];
