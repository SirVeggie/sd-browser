module.exports = {
  apps: [{
    name: 'sd-browser',
    script: 'node',
    args: '-r dotenv/config build',
    env: {
      // adapter-node uses parseInt — no K/M/G suffixes (10M becomes 10 bytes).
      BODY_SIZE_LIMIT: '10485760',
    },
  }]
};
