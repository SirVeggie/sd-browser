module.exports = {
  apps: [{
    name: 'sd-browser',
    script: 'node',
    args: '-r dotenv/config build',
  }]
};
