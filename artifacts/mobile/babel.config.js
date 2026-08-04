module.exports = function (api) {
  api.cache(true);
  return {
    presets: [['babel-preset-expo', { unstable_transformImportMeta: true }]],
    // Required with pnpm: babel-preset-expo cannot always auto-resolve the
    // worklets plugin through pnpm's strict node_modules → without it every
    // useAnimatedStyle crashes with "Failed to create a worklet".
    plugins: ['react-native-worklets/plugin'],
  };
};
