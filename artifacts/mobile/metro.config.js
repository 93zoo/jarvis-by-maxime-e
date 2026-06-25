const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// pnpm workspace: watch the monorepo root so Metro can resolve
// packages installed in the mobile workspace's own node_modules
config.watchFolders = [workspaceRoot];

config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// Allow Metro to follow pnpm symlinks in node_modules/.pnpm
config.resolver.unstable_enableSymlinks = true;

module.exports = config;
