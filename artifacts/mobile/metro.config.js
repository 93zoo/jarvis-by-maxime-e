const { getDefaultConfig } = require('expo/metro-config');
const http = require('http');

const config = getDefaultConfig(__dirname);

// react-native-svg's fetchData.ts imports the Node 'buffer' module. Under pnpm
// Metro cannot resolve it from the package's own node_modules — expose the
// workspace copy explicitly.
config.resolver = {
  ...config.resolver,
  extraNodeModules: {
    ...(config.resolver?.extraNodeModules || {}),
    buffer: require.resolve('buffer'),
  },
};

/**
 * Dev-only proxy: the Expo dev domain serves everything, so requests the web
 * app makes to `/api-server/api/...` would otherwise hit Metro and get HTML
 * back. Forward them to the local API server instead (cloud saves,
 * leaderboard, etc.).
 */
const API_SERVER_PORT = process.env.API_SERVER_PORT || '8080';
const API_PREFIX = '/api-server';

const prevEnhance = config.server?.enhanceMiddleware;
config.server = {
  ...config.server,
  enhanceMiddleware: (middleware, server) => {
    const base = prevEnhance ? prevEnhance(middleware, server) : middleware;
    return (req, res, next) => {
      if (!req.url || !req.url.startsWith(`${API_PREFIX}/`)) {
        return base(req, res, next);
      }
      const targetPath = req.url.slice(API_PREFIX.length);
      const proxyReq = http.request(
        {
          host: '127.0.0.1',
          port: Number(API_SERVER_PORT),
          path: targetPath,
          method: req.method,
          headers: { ...req.headers, host: `127.0.0.1:${API_SERVER_PORT}` },
        },
        (proxyRes) => {
          res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
          proxyRes.pipe(res);
        },
      );
      proxyReq.on('error', () => {
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'API server unreachable' }));
      });
      req.pipe(proxyReq);
    };
  },
};

module.exports = config;
