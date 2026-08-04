module.exports = function (api) {
  api.cache(true);
  return {
    presets: [['babel-preset-expo', { unstable_transformImportMeta: true }]],
    // OBLIGATOIRE sous pnpm : babel-preset-expo essaie d'auto-inclure
    // 'react-native-worklets/plugin' mais sa résolution échoue avec la
    // structure stricte de node_modules pnpm → sans cette ligne, aucun fichier
    // n'est workletisé et chaque animation crash avec
    // "[Worklets] Failed to create a worklet".
    plugins: ['react-native-worklets/plugin'],
  };
};
