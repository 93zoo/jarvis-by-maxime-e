const { withAppBuildGradle } = require('@expo/config-plugins');

/**
 * Suppresses Kotlin deprecation warnings produced by Expo-generated files
 * that are outside the app's control (ReactNativeHost, NativeResponse, etc.).
 *
 * Injects `freeCompilerArgs += ["-Xsuppress-version-warnings"]` into the
 * `kotlinOptions` block of android/app/build.gradle.
 * Idempotent: safe to run after repeated `expo prebuild --clean` calls.
 */
function withKotlinSuppressVersionWarnings(config) {
  return withAppBuildGradle(config, (cfg) => {
    const src = cfg.modResults.contents;

    // Idempotent guard — already patched
    if (src.includes('-Xsuppress-version-warnings')) {
      return cfg;
    }

    if (src.includes('kotlinOptions {')) {
      // Inject into the existing kotlinOptions block
      cfg.modResults.contents = src.replace(
        /kotlinOptions\s*\{/,
        'kotlinOptions {\n        freeCompilerArgs += ["-Xsuppress-version-warnings"]',
      );
    } else {
      // kotlinOptions block absent — insert it after compileOptions
      cfg.modResults.contents = src.replace(
        /(compileOptions\s*\{[^}]+\})/s,
        '$1\n\n    kotlinOptions {\n        freeCompilerArgs += ["-Xsuppress-version-warnings"]\n    }',
      );
    }

    return cfg;
  });
}

module.exports = withKotlinSuppressVersionWarnings;
