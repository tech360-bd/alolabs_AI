'use strict';

// PM2 loads ecosystem files as CommonJS; ESM imports are not supported here.
/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('node:fs');
const path = require('node:path');
const { parseEnvConfig } = require('./scripts/parse-env-config.cjs');

const appRoot = __dirname;
const envConfigPath = path.join(appRoot, '.env.config');
let configuredEnv = {};

try {
  // PM2 does not load `env_file` in ecosystem configs. Read and parse the
  // dedicated file here; never invoke a shell, so `$` in secrets is literal.
  configuredEnv = parseEnvConfig(fs.readFileSync(envConfigPath, 'utf8'));
} catch (error) {
  if (error && error.code === 'ENOENT') {
    console.warn(
      `[AgentOS] ${envConfigPath} is missing; using environment inherited by PM2. ` +
      'Copy .env.example to .env.config for file-based configuration.',
    );
  } else {
    throw error;
  }
}

// Match dotenv's usual precedence: explicit process environment wins over the
// file, while the server mode, bind address, and port are fixed for this app.
for (const key of Object.keys(configuredEnv)) {
  if (process.env[key] !== undefined) configuredEnv[key] = process.env[key];
}

module.exports = {
  apps: [{
    name: 'alolabs-agentos',
    cwd: appRoot,
    script: path.join(appRoot, '.next/standalone/server.js'),
    interpreter: 'node',
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    restart_delay: 5000,
    kill_timeout: 10000,
    listen_timeout: 15000,
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    env: {
      ...configuredEnv,
      NODE_ENV: 'production',
      HOSTNAME: '127.0.0.1',
      PORT: '3011',
    },
  }],
};
