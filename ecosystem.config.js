module.exports = {
  apps: [{
    name: 'alolabs-agentos',
    cwd: '/home/alamin/alolabs_AI',
    script: '.next/standalone/server.js',
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
      NODE_ENV: 'production',
      HOSTNAME: '0.0.0.0',
      PORT: 3012,
    },
  }],
};
