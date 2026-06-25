const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname; // = /home/runner/workspace/artifacts/mobile

const config = getDefaultConfig(projectRoot);

module.exports = config;
