#!/usr/bin/env node
import { program } from 'commander';
import dotenv from 'dotenv';

program
  .usage('<api>')
  .option('-h, --host <host>', 'Host for server to listen on', '127.0.0.1')
  .option('-p, --port <port>', 'Port for server to listen on', 8081)
  .option('--env <env>', 'File to load ENV variables from')
  .action(async function(api) {
    if (program.env) {
      dotenv.config({ path: api.env });
    }
    const server = await import('../lib/index.js');
    server.start(api, {
      host: api.host,
      port: api.port
    });
  })
  .parse(process.argv);
