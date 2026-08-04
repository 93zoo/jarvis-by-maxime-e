module.exports = function (api) {
  api.cache(true);
  return {
    presets: [['babel-preset-expo', { unstable_transformImportMeta: true }]],
    // NE PAS ajouter 'react-native-worklets/plugin' ici : babel-preset-expo
    // (SDK 54) l'inclut déjà automatiquement. Le déclarer en double transforme
    // les worklets deux fois → "Failed to create a worklet" au runtime.
  };
};
