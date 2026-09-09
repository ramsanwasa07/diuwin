module.exports = {
  apps: [
    {
      name: 'diuwin-server',
      script: 'server.js',
      instances: 1, // Single instance for atomic SQLite WAL mode
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'development',
        PORT: 3000
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000
      },
      error_file: 'logs/pm2-err.log',
      out_file: 'logs/pm2-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      restart_delay: 3000,
      max_restarts: 10
    }
  ]
};
