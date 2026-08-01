const fs = require('fs');

const content = fs.readFileSync('artifacts/mobile/app/(tabs)/index.tsx', 'utf-8');

// The issue was a missing bracket/brace inside ForgeScreen. We need to make sure the replacement was clean.
// Let's replace the whole file from a clean snapshot to be 100% sure we don't have stray characters.

// Wait, the previous run replaced everything correctly but might have truncated `newForgeScreen` if `forgeScreenMatch` failed or if `newReturn` missed a closing brace.

// Let's check `newReturn`:
/*
  return (
    <ImageBackground
...
    </ImageBackground>
  );
}
*/
// It ends with `}\n`. So it should match the end of `ForgeScreen`.

// Wait, let's fix it manually instead. The error says `app/(tabs)/index.tsx:1672:1 - error TS1005: ',' expected. const styles = StyleSheet.create({`
// That usually means the previous statement wasn't closed properly.

const finalContent = content.replace(/}\n\n\nconst styles = StyleSheet.create\(\{/, '}\n\nconst styles = StyleSheet.create({');
fs.writeFileSync('artifacts/mobile/app/(tabs)/index.tsx', finalContent);
console.log('Done replacement');
