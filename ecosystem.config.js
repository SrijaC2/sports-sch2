module.exports = {
  apps: [
    {
      name: "sports",
      script: "index.js",
      instances: "max",
      exec_mode: "cluster",
      watch: true,
      ignore_watch: ["node_modules", "logs"],
      error_file: "logs/error.log",
      out_file: "logs/out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      merge_logs: true,
      env_production: {
        NODE_ENV: "production",
      },
    },
  ],
};
