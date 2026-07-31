/**
 * ForgeScene3D — Bird's-eye workshop view inspired by the reference photo.
 *
 * Camera: high overhead angle looking down at ~55° — shows the whole atelier.
 * Layout: central furnace with roaring fire, 3 anvils, tool rack, barrels,
 *         workbench, scattered tools — all lit exclusively by firelight.
 * Sparks: streak line-segments burst from the active anvil on each strike.
 * Audio:  starts forge ambience (fire crackle) on mount, stops on unmount.
 */
import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { Platform, StyleSheet, View, Text } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { GLView, ExpoWebGLRenderingContext } from 'expo-gl';
import * as THREE from 'three';
import AudioManager from '@/utils/AudioManager';

// ─── WebGL check ──────────────────────────────────────────────────────────────
function checkWebGL(): boolean {
  if (Platform.OS !== 'web') return true;
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext &&
      (c.getContext('webgl') || c.getContext('experimental-webgl')));
  } catch { return false; }
}

// ─── 2D fallback ─────────────────────────────────────────────────────────────
function ForgeFallback({ craftPhase }: { craftPhase: CraftPhase }) {
  return (
    <LinearGradient colors={['#0A0608', '#1C0A04', '#0A0608']} style={styles.fallback}>
      <View style={styles.fbGlow} />
      <Text style={styles.fbLabel}>
        {craftPhase === 'IDLE' ? '⚒  FORGE' :
         craftPhase === 'HEATING' ? '🔥  Chauffe…' :
         craftPhase === 'HAMMERING' ? '⚒  Martelage' :
         craftPhase === 'COOLING' ? '💧  Trempe' : '✨  Terminé'}
      </Text>
    </LinearGradient>
  );
}

export type CraftPhase = 'IDLE' | 'HEATING' | 'HAMMERING' | 'COOLING' | 'RESULT';
export interface ForgeScene3DRef { triggerHammerStrike: () => void; }
interface Props { craftPhase: CraftPhase; upgradeLevel?: number; }

// ─── Geometry helpers ─────────────────────────────────────────────────────────
function mkBox(w: number, h: number, d: number, mat: THREE.Material,
               px = 0, py = 0, pz = 0, ry = 0): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(px, py, pz);
  if (ry) m.rotation.y = ry;
  return m;
}
function mkCyl(rt: number, rb: number, h: number, s: number, mat: THREE.Material,
               px = 0, py = 0, pz = 0, rx = 0, rz = 0): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, s), mat);
  m.position.set(px, py, pz);
  if (rx) m.rotation.x = rx;
  if (rz) m.rotation.z = rz;
  return m;
}
function mkSphere(r: number, mat: THREE.Material, px = 0, py = 0, pz = 0): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), mat);
  m.position.set(px, py, pz);
  return m;
}

// ─── Anvil builder (reusable) ─────────────────────────────────────────────────
function buildAnvil(
  scene: THREE.Scene,
  ironMat: THREE.Material, steelMat: THREE.Material,
  ironDark: THREE.Material, woodMat: THREE.Material, woodLight: THREE.Material,
  px: number, py: number, pz: number, ry = 0, scale = 1.0,
): THREE.Group {
  const g = new THREE.Group();
  // Stump
  g.add(mkCyl(0.28 * scale, 0.34 * scale, 0.55 * scale, 10, woodMat,
              0, 0.275 * scale, 0));
  g.add(mkCyl(0.282 * scale, 0.282 * scale, 0.02 * scale, 10, woodLight,
              0, 0.555 * scale, 0));
  // Anvil base
  g.add(mkBox(0.82 * scale, 0.20 * scale, 0.48 * scale, ironDark,
              0, 0.655 * scale, 0));
  g.add(mkBox(0.42 * scale, 0.26 * scale, 0.40 * scale, ironDark,
              0, 0.845 * scale, 0));
  g.add(mkBox(0.90 * scale, 0.16 * scale, 0.44 * scale, ironMat,
              0, 0.985 * scale, 0));
  // Working face
  g.add(mkBox(0.78 * scale, 0.030 * scale, 0.36 * scale, steelMat,
              -0.03 * scale, 1.075 * scale, 0));
  // Horn
  const horn = new THREE.Mesh(
    new THREE.ConeGeometry(0.07 * scale, 0.52 * scale, 10), steelMat);
  horn.rotation.z = -Math.PI / 2;
  horn.position.set(0.73 * scale, 0.98 * scale, 0);
  g.add(horn);
  // Heel
  g.add(mkBox(0.13 * scale, 0.10 * scale, 0.28 * scale, ironDark,
              -0.48 * scale, 0.96 * scale, 0));

  g.position.set(px, py, pz);
  g.rotation.y = ry;
  scene.add(g);
  return g;
}

// ─── Main component ───────────────────────────────────────────────────────────
const ForgeScene3D = forwardRef<ForgeScene3DRef, Props>(
  ({ craftPhase, upgradeLevel = 0 }, ref) => {
    const [webglOk] = useState(() => checkWebGL());
    const craftPhaseRef   = useRef<CraftPhase>(craftPhase);
    const upgradeLevelRef = useRef(upgradeLevel);
    const cleanupRef      = useRef<(() => void) | null>(null);
    const triggerRef      = useRef<(() => void) | null>(null);

    useEffect(() => { craftPhaseRef.current = craftPhase; }, [craftPhase]);
    useEffect(() => { upgradeLevelRef.current = upgradeLevel; }, [upgradeLevel]);

    // Start / stop forge ambience with this component's lifecycle
    useEffect(() => {
      AudioManager.startForgeAmbience();
      return () => {
        AudioManager.stopForgeAmbience();
        cleanupRef.current?.();
      };
    }, []);

    useImperativeHandle(ref, () => ({
      triggerHammerStrike: () => { triggerRef.current?.(); },
    }));

    const onContextCreate = useCallback((gl: ExpoWebGLRenderingContext) => {
      const W = gl.drawingBufferWidth;
      const H = gl.drawingBufferHeight;

      if (!(gl as any).canvas) {
        (gl as any).canvas = {
          width: W, height: H, style: {},
          addEventListener: () => {}, removeEventListener: () => {},
          dispatchEvent: () => false,
          clientWidth: W, clientHeight: H,
        };
      }

      let renderer: THREE.WebGLRenderer;
      try {
        renderer = new THREE.WebGLRenderer({
          canvas: (gl as any).canvas,
          context: gl as unknown as WebGL2RenderingContext,
          antialias: false,
        });
      } catch {
        renderer = new THREE.WebGLRenderer({
          context: gl as unknown as WebGL2RenderingContext,
          antialias: false,
        });
      }
      renderer.setPixelRatio(1);
      renderer.setSize(W, H);
      renderer.setClearColor(0x080506);

      // ── Scene ───────────────────────────────────────────────────────────────
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x080506);
      scene.fog = new THREE.FogExp2(0x080506, 0.055);

      // ── Camera — high overhead bird's-eye, like the reference photo ─────────
      // Looking down at ~55° from vertical, from the right-front corner
      const camera = new THREE.PerspectiveCamera(54, W / H, 0.1, 40);
      camera.position.set(3.5, 11.5, 8.0);
      camera.lookAt(0.0, 0.0, 0.5);

      // ── Materials ───────────────────────────────────────────────────────────
      const floorMat   = new THREE.MeshStandardMaterial({ color: 0x2A2018, roughness: 0.97 });
      const floorDark  = new THREE.MeshStandardMaterial({ color: 0x1C1610, roughness: 1.00 });
      const stoneMat   = new THREE.MeshStandardMaterial({ color: 0x3C3028, roughness: 0.95 });
      const stoneDark  = new THREE.MeshStandardMaterial({ color: 0x28221A, roughness: 0.98 });
      const brickMat   = new THREE.MeshStandardMaterial({ color: 0x4A3828, roughness: 0.94 });
      const woodMat    = new THREE.MeshStandardMaterial({ color: 0x3C2008, roughness: 0.90 });
      const woodLight  = new THREE.MeshStandardMaterial({ color: 0x5C3818, roughness: 0.82 });
      const beamMat    = new THREE.MeshStandardMaterial({ color: 0x241408, roughness: 0.93 });
      const ironMat    = new THREE.MeshStandardMaterial({ color: 0x383838, roughness: 0.22, metalness: 0.95 });
      const steelMat   = new THREE.MeshStandardMaterial({ color: 0x606060, roughness: 0.08, metalness: 0.99 });
      const ironDark   = new THREE.MeshStandardMaterial({ color: 0x202020, roughness: 0.50, metalness: 0.88 });
      const ironRust   = new THREE.MeshStandardMaterial({ color: 0x4A3020, roughness: 0.85, metalness: 0.55 });
      const coalMat    = new THREE.MeshStandardMaterial({ color: 0x141010, roughness: 1.00 });
      const sootMat    = new THREE.MeshStandardMaterial({ color: 0x080606, roughness: 1.00 });
      const ropeMatM   = new THREE.MeshStandardMaterial({ color: 0x6A5030, roughness: 0.95 });
      const barrelMat  = new THREE.MeshStandardMaterial({ color: 0x3A2210, roughness: 0.88 });
      const hoopMat    = new THREE.MeshStandardMaterial({ color: 0x282020, roughness: 0.55, metalness: 0.80 });
      const metalMat   = new THREE.MeshStandardMaterial({
        color: 0x5A5A5A, roughness: 0.22, metalness: 0.95,
        emissive: new THREE.Color(0x000000), emissiveIntensity: 0,
      });

      // Fire glow planes
      const fireMat1 = new THREE.MeshStandardMaterial({
        color: 0xFF3300, emissive: new THREE.Color(0xFF2200), emissiveIntensity: 9.0,
        transparent: true, opacity: 0.90, side: THREE.DoubleSide,
      });
      const fireMat2 = new THREE.MeshStandardMaterial({
        color: 0xFF8800, emissive: new THREE.Color(0xFF6600), emissiveIntensity: 7.0,
        transparent: true, opacity: 0.75, side: THREE.DoubleSide,
      });
      const fireMat3 = new THREE.MeshStandardMaterial({
        color: 0xFFCC44, emissive: new THREE.Color(0xFFAA22), emissiveIntensity: 11.0,
        transparent: true, opacity: 0.60, side: THREE.DoubleSide,
      });
      const glowCoreMat = new THREE.MeshStandardMaterial({
        color: 0xFFFFBB, emissive: new THREE.Color(0xFFFFBB), emissiveIntensity: 16.0,
        transparent: true, opacity: 0.85,
      });

      // Lantern
      const lanternMat = new THREE.MeshStandardMaterial({
        color: 0xFFCC66, emissive: new THREE.Color(0xFFCC66), emissiveIntensity: 6.0,
        transparent: true, opacity: 0.80,
      });

      // ── Lighting ─────────────────────────────────────────────────────────────
      // Almost no ambient — fire does all the work → dramatic shadows
      scene.add(new THREE.AmbientLight(0x1A1008, 0.5));

      // Main furnace fire — powerful central orange light
      // decay=1: Three.js r155+ defaults to decay=2 (physical); use 1 for broader reach
      const fireMain  = new THREE.PointLight(0xFF5500, 22.0, 18, 1);
      fireMain.position.set(-0.5, 3.2, -3.0);
      scene.add(fireMain);

      const fireFill  = new THREE.PointLight(0xFF7700, 12.0, 12, 1);
      fireFill.position.set(-0.5, 1.8, -2.6);
      scene.add(fireFill);

      const fireFloor = new THREE.PointLight(0xFF9900, 8.0, 9, 1);
      fireFloor.position.set(-0.5, 0.5, -2.8);
      scene.add(fireFloor);

      // Hanging lantern — warm secondary light above center
      const lanternLight = new THREE.PointLight(0xFFAA44, 5.0, 10, 1);
      lanternLight.position.set(1.5, 4.5, 1.5);
      scene.add(lanternLight);

      // Cool daylight leak from a gap/window — subtle blue-grey
      const dayLeakLight = new THREE.DirectionalLight(0x88AACC, 0.35);
      dayLeakLight.position.set(-6, 10, 8);
      scene.add(dayLeakLight);

      // Strike flash at active anvil
      const strikeLight = new THREE.PointLight(0xFFEEAA, 0, 4, 1);
      strikeLight.position.set(1.0, 2.0, 0.5);
      scene.add(strikeLight);

      // Metal glow light
      const metalGlow = new THREE.PointLight(0xFF5500, 0, 3, 1);
      metalGlow.position.set(1.0, 1.5, 0.5);
      scene.add(metalGlow);

      // ── Floor — flagstone ────────────────────────────────────────────────────
      scene.add(mkBox(20, 0.08, 20, floorMat, 0, -0.04, 0));
      // Flagstone grid lines
      const groutM = new THREE.MeshStandardMaterial({ color: 0x141008, roughness: 1 });
      for (let i = -6; i <= 6; i++) {
        scene.add(mkBox(20, 0.018, 0.040, groutM, 0, 0.01, i * 1.15));
        scene.add(mkBox(0.040, 0.018, 20, groutM, i * 1.15, 0.01, 0));
      }
      // Dirt stains / worn patches
      for (let s = 0; s < 12; s++) {
        const sz = 0.4 + Math.random() * 0.8;
        scene.add(mkBox(sz, 0.006, sz * 0.7, floorDark,
          (Math.random() - 0.5) * 9, 0.025, (Math.random() - 0.5) * 8));
      }

      // ── Walls ────────────────────────────────────────────────────────────────
      const wallM = new THREE.MeshStandardMaterial({ color: 0x1E1814, roughness: 0.98 });
      // Back wall
      scene.add(mkBox(18, 9, 0.25, wallM, 0, 4.5, -6.0));
      // Brick rows on back wall
      for (let row = 0; row < 8; row++) {
        for (let col = -5; col <= 5; col++) {
          const off = row % 2 === 0 ? 0 : 0.9;
          scene.add(mkBox(1.62, 0.28, 0.055,
            row % 3 === 0 ? stoneDark : brickMat,
            col * 1.80 + off, 0.5 + row * 0.46, -5.87));
        }
      }
      // Left wall
      scene.add(mkBox(0.25, 9, 18, wallM, -6.5, 4.5, 0));
      // Brick rows on left wall
      for (let row = 0; row < 8; row++) {
        for (let col = -5; col <= 5; col++) {
          const off = row % 2 === 0 ? 0 : 0.9;
          scene.add(mkBox(0.055, 0.28, 1.62,
            row % 3 === 0 ? stoneDark : brickMat,
            -6.37, 0.5 + row * 0.46, col * 1.80 + off));
        }
      }
      // Right wall
      scene.add(mkBox(0.25, 9, 18, wallM, 6.5, 4.5, 0));
      // Soot stain above forge on back wall
      scene.add(mkBox(2.8, 2.2, 0.06, sootMat, -0.5, 5.5, -5.87));

      // ── Ceiling / roof beams ─────────────────────────────────────────────────
      scene.add(mkBox(15, 0.18, 18, beamMat, 0, 7.8, 0)); // ceiling plane
      const beamPositions = [-3.0, -1.0, 1.0, 3.0];
      for (const bx of beamPositions) {
        scene.add(mkBox(0.26, 0.32, 18, beamMat, bx, 7.5, 0));
      }
      for (const bz of [-4.5, -1.5, 1.5, 4.5]) {
        scene.add(mkBox(15, 0.22, 0.22, beamMat, 0, 7.3, bz));
      }
      // Hanging rope from ceiling
      scene.add(mkCyl(0.018, 0.018, 2.8, 6, ropeMatM, 1.5, 6.2, 1.5));

      // ── Hanging lantern ───────────────────────────────────────────────────────
      const lantG = new THREE.Group();
      // Frame
      for (let f = 0; f < 4; f++) {
        const a = (f / 4) * Math.PI * 2 + Math.PI / 4;
        lantG.add(mkBox(0.04, 0.22, 0.04, ironDark, Math.cos(a) * 0.08, 0, Math.sin(a) * 0.08));
      }
      lantG.add(mkCyl(0.10, 0.10, 0.03, 8, ironDark, 0, 0.13, 0));
      lantG.add(mkCyl(0.10, 0.10, 0.03, 8, ironDark, 0, -0.13, 0));
      // Glow core
      lantG.add(mkSphere(0.055, lanternMat, 0, 0, 0));
      lantG.position.set(1.5, 4.8, 1.5);
      scene.add(lantG);

      // ── FORGE FURNACE — back-center, like the photo ─────────────────────────
      const forge = new THREE.Group();
      // Platform / plinth
      forge.add(mkBox(3.0, 0.50, 2.0, stoneMat, 0, 0.25, 0));
      // Heavy stone body
      forge.add(mkBox(3.0, 1.60, 2.0, stoneMat, 0, 1.30, 0));
      // Opening recess (soot interior)
      forge.add(mkBox(1.30, 1.00, 0.35, sootMat, 0, 1.10, 1.02));
      // Arch over opening
      for (let i = -2; i <= 2; i++) {
        forge.add(mkBox(0.46, 0.30, 0.25, i === 0 ? stoneDark : stoneMat,
                        i * 0.46, 1.66, 1.02));
      }
      // Coal bed
      forge.add(mkBox(1.20, 0.08, 0.60, coalMat, 0, 0.54, 0.7));
      for (let c = 0; c < 18; c++) {
        const sz = 0.05 + Math.random() * 0.06;
        const coal = mkSphere(sz, coalMat,
          (Math.random() - 0.5) * 0.80, 0.58 + sz * 0.5,
          0.45 + (Math.random() - 0.5) * 0.35);
        coal.scale.y = 0.5;
        forge.add(coal);
      }
      // Chimney
      forge.add(mkCyl(0.35, 0.42, 2.5, 8, stoneDark, -0.1, 3.55, -0.3));
      forge.add(mkCyl(0.50, 0.37, 0.18, 8, stoneMat,  -0.1, 4.82, -0.3));
      // Hood / canopy over opening
      forge.add(mkBox(3.2, 0.14, 2.2, stoneDark, 0, 2.18, 0));
      // Tool shelf on forge
      forge.add(mkBox(0.60, 0.06, 0.24, woodLight, -0.9, 1.95, 0.72));

      // FIRE PLANES — 3 layers, face outward (+Z) toward the room
      const fp1 = new THREE.Mesh(new THREE.PlaneGeometry(1.10, 1.35), fireMat1);
      fp1.position.set(0, 1.10, 1.08);
      forge.add(fp1);
      const fp2 = new THREE.Mesh(new THREE.PlaneGeometry(0.72, 1.00), fireMat2);
      fp2.position.set(0.06, 1.02, 1.11);
      forge.add(fp2);
      const fp3 = new THREE.Mesh(new THREE.PlaneGeometry(0.40, 0.58), fireMat3);
      fp3.position.set(-0.05, 0.88, 1.14);
      forge.add(fp3);
      const fpCore = mkSphere(0.13, glowCoreMat, 0, 0.65, 1.06);
      forge.add(fpCore);

      forge.position.set(-0.5, 0.0, -4.0);
      scene.add(forge);

      // ── THREE ANVILS on stumps ───────────────────────────────────────────────
      // Active anvil (center-right — this is where hammering happens)
      buildAnvil(scene, ironMat, steelMat, ironDark, woodMat, woodLight,
                  1.0, 0, 0.5, -0.35, 1.0);
      // Left anvil (medium size, back-left)
      buildAnvil(scene, ironMat, steelMat, ironDark, woodMat, woodLight,
                 -2.2, 0, -1.0, 0.6, 0.82);
      // Right-back anvil (small, against right wall)
      buildAnvil(scene, ironMat, steelMat, ironDark, woodMat, woodLight,
                  3.8, 0, -1.8, -1.1, 0.68);
      // Bick iron / cone anvil on floor
      const bickG = new THREE.Group();
      bickG.add(mkBox(0.22, 0.18, 0.22, ironDark, 0, 0.09, 0));
      const bickCone = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.50, 8), steelMat);
      bickCone.position.set(0, 0.43, 0);
      bickG.add(bickCone);
      bickG.position.set(-1.0, 0, 1.8);
      bickG.rotation.y = 0.8;
      scene.add(bickG);

      // Metal piece on active anvil
      const metalPiece = new THREE.Mesh(new THREE.BoxGeometry(0.40, 0.07, 0.14), metalMat);
      metalPiece.position.set(1.0, 1.10, 0.5);
      metalPiece.rotation.y = -0.35;
      metalPiece.visible = false;
      scene.add(metalPiece);

      // ── TOOL RACK on left wall ────────────────────────────────────────────────
      // Horizontal rail
      scene.add(mkBox(0.10, 0.14, 4.5, woodMat, -6.20, 2.60, -1.0));
      // Pegs
      const pegPositions = [-3.0, -2.2, -1.4, -0.6, 0.2, 1.0, 1.8, 2.6];
      for (const pz of pegPositions) {
        scene.add(mkCyl(0.018, 0.018, 0.20, 6, ironDark, -6.12, 2.50, pz, 0, Math.PI / 2));
        const toolLen = 0.30 + Math.random() * 0.55;
        const toolR = 0.015 + Math.random() * 0.010;
        scene.add(mkCyl(toolR, toolR * 0.7, toolLen, 6, Math.random() > 0.5 ? ironDark : ironRust,
          -6.10, 2.50 - toolLen / 2, pz));
      }
      // Large tools hanging vertically
      for (let t = 0; t < 5; t++) {
        const len = 0.55 + Math.random() * 0.60;
        scene.add(mkCyl(0.025, 0.016, len, 6, ironRust,
          -6.12, 2.50 - len / 2, -2.6 + t * 0.7));
        // Hammer/tong heads
        scene.add(mkBox(0.08, 0.14, 0.07, ironDark,
          -6.10, 2.38, -2.6 + t * 0.7));
      }
      // Low shelf near left wall
      scene.add(mkBox(0.10, 0.08, 2.2, woodLight, -6.20, 0.88, 2.2));
      // Items on shelf
      scene.add(mkCyl(0.055, 0.045, 0.22, 8, ironRust, -6.12, 0.99, 1.5));
      scene.add(mkCyl(0.045, 0.060, 0.18, 8, ironRust, -6.12, 0.97, 2.0));
      scene.add(mkBox(0.10, 0.12, 0.20, ironDark, -6.10, 0.98, 2.6));

      // ── BARRELS — scattered like in the photo ────────────────────────────────
      function buildBarrel(bx: number, bz: number, ry: number, scale = 1.0) {
        const bg = new THREE.Group();
        bg.add(mkCyl(0.28 * scale, 0.22 * scale, 0.58 * scale, 12, barrelMat,
                     0, 0.29 * scale, 0));
        bg.add(mkCyl(0.255 * scale, 0.255 * scale, 0.025 * scale, 12, hoopMat,
                     0, 0.10 * scale, 0));
        bg.add(mkCyl(0.265 * scale, 0.265 * scale, 0.025 * scale, 12, hoopMat,
                     0, 0.29 * scale, 0));
        bg.add(mkCyl(0.255 * scale, 0.255 * scale, 0.025 * scale, 12, hoopMat,
                     0, 0.48 * scale, 0));
        // Top
        bg.add(mkCyl(0.24 * scale, 0.24 * scale, 0.025 * scale, 12, woodLight,
                     0, 0.565 * scale, 0));
        bg.position.set(bx, 0, bz);
        bg.rotation.y = ry;
        scene.add(bg);
      }
      buildBarrel(-3.5, 2.8, 0.3, 1.0);
      buildBarrel(-3.0, 3.6, -0.5, 0.88);   // smaller, tipped beside first
      buildBarrel(4.2, 2.2, 0.8, 1.0);
      buildBarrel(4.8, 3.0, -0.4, 0.90);
      buildBarrel(-4.8, -1.5, 1.2, 0.95);
      // Water trough (long barrel-like)
      const troughG = new THREE.Group();
      troughG.add(mkBox(1.40, 0.35, 0.55, barrelMat, 0, 0.175, 0));
      const waterM = new THREE.MeshStandardMaterial({ color: 0x0E2030, roughness: 0.04, metalness: 0.4 });
      troughG.add(mkBox(1.30, 0.05, 0.44, waterM, 0, 0.35, 0));
      // Hoop bands
      for (const tx of [-0.55, 0, 0.55]) {
        troughG.add(mkBox(0.025, 0.38, 0.58, hoopMat, tx, 0.19, 0));
      }
      troughG.position.set(2.8, 0, 3.5);
      troughG.rotation.y = 0.5;
      scene.add(troughG);

      // ── WORKBENCHES ───────────────────────────────────────────────────────────
      // Right-side workbench
      const wb1 = new THREE.Group();
      wb1.add(mkBox(2.2, 0.12, 0.80, woodLight, 0, 0.06, 0));
      for (const [dx, dz] of [[-0.90, 0.30], [0.90, 0.30], [-0.90, -0.30], [0.90, -0.30]] as [number,number][]) {
        wb1.add(mkCyl(0.042, 0.042, 0.92, 6, woodMat, dx, -0.46, dz));
      }
      // Support shelf below
      wb1.add(mkBox(1.8, 0.08, 0.60, woodMat, 0, -0.64, 0));
      wb1.position.set(5.0, 0.92, 1.0);
      wb1.rotation.y = Math.PI / 2;
      scene.add(wb1);
      // Items on right workbench
      scene.add(mkBox(0.25, 0.08, 0.16, ironDark, 4.90, 1.02, 0.3));
      scene.add(mkBox(0.30, 0.12, 0.12, ironRust, 4.90, 1.06, -0.5));
      scene.add(mkCyl(0.040, 0.028, 0.26, 6, ironDark, 4.88, 1.15, 0.8));
      // Back-right workbench
      const wb2 = new THREE.Group();
      wb2.add(mkBox(2.6, 0.12, 0.75, woodLight, 0, 0.06, 0));
      for (const [dx, dz] of [[-1.10, 0.28], [1.10, 0.28], [-1.10, -0.28], [1.10, -0.28]] as [number,number][]) {
        wb2.add(mkCyl(0.042, 0.042, 0.90, 6, woodMat, dx, -0.45, dz));
      }
      wb2.position.set(2.5, 0.90, -4.8);
      scene.add(wb2);
      // Items
      for (let i = 0; i < 5; i++) {
        const len = 0.20 + Math.random() * 0.30;
        scene.add(mkCyl(0.022, 0.016, len, 6, Math.random() > 0.4 ? ironRust : ironDark,
          1.5 + i * 0.40, 0.97, -4.65));
      }

      // ── Scattered floor items ─────────────────────────────────────────────────
      // Chain coil
      for (let c = 0; c < 8; c++) {
        const a = (c / 8) * Math.PI * 2;
        scene.add(mkCyl(0.022, 0.022, 0.06, 6, ironRust,
          -4.2 + Math.cos(a) * 0.16, 0.03, 3.5 + Math.sin(a) * 0.16, Math.PI / 2));
      }
      // Tongs on floor near active anvil
      const tongs = new THREE.Group();
      for (const s of [-1, 1]) {
        const arm = mkCyl(0.012, 0.012, 0.62, 6, ironDark);
        arm.rotation.z = s * 0.10;
        arm.position.x = s * 0.016;
        tongs.add(arm);
      }
      tongs.position.set(0.3, 0.31, 1.4);
      tongs.rotation.set(Math.PI / 2, 0.4, 0);
      scene.add(tongs);
      // Coal pile near forge
      for (let c = 0; c < 22; c++) {
        const sz = 0.05 + Math.random() * 0.07;
        const coal = mkSphere(sz, coalMat,
          -1.6 + (Math.random() - 0.5) * 0.6,
          sz * 0.5,
          -2.2 + (Math.random() - 0.5) * 0.5);
        coal.scale.y = 0.5;
        scene.add(coal);
      }
      // Shovel leaning against wall
      scene.add(mkCyl(0.020, 0.020, 1.50, 6, woodMat, -5.8, 0.75, -2.5, 0, 0.20));
      scene.add(mkBox(0.22, 0.06, 0.30, ironDark, -5.70, 0.04, -2.5));
      // Hammer left on floor
      scene.add(mkCyl(0.022, 0.026, 0.55, 6, woodMat, 2.1, 0.03, 2.4, 0, 0.35));
      scene.add(mkBox(0.11, 0.22, 0.09, ironDark, 2.1, 0.12, 2.08));

      // ── SMOKE (from chimney) ──────────────────────────────────────────────────
      const SMOKE = 20;
      const smokeGeo = new THREE.BufferGeometry();
      const smokePos = new Float32Array(SMOKE * 3);
      smokeGeo.setAttribute('position', new THREE.BufferAttribute(smokePos, 3));
      const smokeVel: THREE.Vector3[] = Array.from({ length: SMOKE }, () => new THREE.Vector3());
      const smokeLife = new Float32Array(SMOKE);
      const smokeMat = new THREE.PointsMaterial({
        color: 0x1C1410, size: 0.40, sizeAttenuation: true,
        transparent: true, opacity: 0.30, depthWrite: false,
      });
      const smokePts = new THREE.Points(smokeGeo, smokeMat);
      scene.add(smokePts);
      const resetSmoke = (i: number) => {
        smokePos[i*3]   = -0.6  + (Math.random() - 0.5) * 0.25;
        smokePos[i*3+1] = 6.2   + Math.random() * 0.5;
        smokePos[i*3+2] = -4.3  + (Math.random() - 0.5) * 0.20;
        smokeVel[i].set(
          (Math.random() - 0.5) * 0.010,
          0.018 + Math.random() * 0.012,
          (Math.random() - 0.5) * 0.010,
        );
        smokeLife[i] = 1.4 + Math.random() * 1.8;
      };
      for (let i = 0; i < SMOKE; i++) { resetSmoke(i); smokePos[i*3+1] += Math.random() * 3.0; }

      // ── AMBIENT furnace sparks ────────────────────────────────────────────────
      const AMB = 32;
      const ambGeo = new THREE.BufferGeometry();
      const ambPos = new Float32Array(AMB * 3);
      ambGeo.setAttribute('position', new THREE.BufferAttribute(ambPos, 3));
      const ambVel: THREE.Vector3[] = Array.from({ length: AMB }, () => new THREE.Vector3());
      const ambLife = new Float32Array(AMB);
      const ambMat = new THREE.PointsMaterial({
        color: 0xFF6600, size: 0.09, sizeAttenuation: true,
        blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
      });
      const ambPts = new THREE.Points(ambGeo, ambMat);
      ambPts.visible = false;
      scene.add(ambPts);
      const resetAmb = (i: number) => {
        ambPos[i*3]   = -0.5 + (Math.random() - 0.5) * 0.80;
        ambPos[i*3+1] = 0.65;
        ambPos[i*3+2] = -3.10 + (Math.random() - 0.5) * 0.60;
        ambVel[i].set(
          (Math.random() - 0.5) * 0.05,
          0.06 + Math.random() * 0.10,
          (Math.random() - 0.5) * 0.04,
        );
        ambLife[i] = 0.5 + Math.random() * 1.0;
      };
      for (let i = 0; i < AMB; i++) { resetAmb(i); ambPos[i*3+1] += Math.random() * 1.5; }

      // ── STRIKE SPARKS — streaks ────────────────────────────────────────────────
      const SPARKS = 180;
      const streakPos = new Float32Array(SPARKS * 6);
      const streakGeo = new THREE.BufferGeometry();
      streakGeo.setAttribute('position', new THREE.BufferAttribute(streakPos, 3));
      const streakVel: THREE.Vector3[] = Array.from({ length: SPARKS }, () => new THREE.Vector3());
      const streakLife = new Float32Array(SPARKS);
      const streakLines = new THREE.LineSegments(
        streakGeo,
        new THREE.LineBasicMaterial({
          color: 0xFFCC44,
          blending: THREE.AdditiveBlending,
          transparent: true,
          depthWrite: false,
        }),
      );
      streakLines.visible = false;
      scene.add(streakLines);

      // White hot secondary sparks
      const SPARKS2 = 90;
      const streakPos2 = new Float32Array(SPARKS2 * 6);
      const streakGeo2 = new THREE.BufferGeometry();
      streakGeo2.setAttribute('position', new THREE.BufferAttribute(streakPos2, 3));
      const streakVel2: THREE.Vector3[] = Array.from({ length: SPARKS2 }, () => new THREE.Vector3());
      const streakLife2 = new Float32Array(SPARKS2);
      const streakLines2 = new THREE.LineSegments(
        streakGeo2,
        new THREE.LineBasicMaterial({
          color: 0xFFFFEE,
          blending: THREE.AdditiveBlending,
          transparent: true,
          depthWrite: false,
        }),
      );
      streakLines2.visible = false;
      scene.add(streakLines2);

      // Impact point = active anvil face
      const IMPACT = new THREE.Vector3(1.0, 1.12, 0.5);

      const resetStreak = (i: number) => {
        const spd = 0.30 + Math.random() * 0.60;
        const elev = 0.15 + Math.random() * 0.80;
        const azim = Math.random() * Math.PI * 2;
        streakVel[i].set(
          Math.cos(azim) * Math.cos(elev) * spd,
          Math.sin(elev) * spd * 0.85,
          Math.sin(azim) * Math.cos(elev) * spd,
        );
        streakPos[i*6]=IMPACT.x; streakPos[i*6+1]=IMPACT.y; streakPos[i*6+2]=IMPACT.z;
        streakPos[i*6+3]=IMPACT.x; streakPos[i*6+4]=IMPACT.y; streakPos[i*6+5]=IMPACT.z;
        streakLife[i] = 0.38 + Math.random() * 0.70;
      };
      const resetStreak2 = (i: number) => {
        const spd = 0.45 + Math.random() * 0.80;
        const elev = 0.20 + Math.random() * 0.85;
        const azim = Math.random() * Math.PI * 2;
        streakVel2[i].set(
          Math.cos(azim) * Math.cos(elev) * spd,
          Math.sin(elev) * spd * 1.05,
          Math.sin(azim) * Math.cos(elev) * spd,
        );
        streakPos2[i*6]=IMPACT.x; streakPos2[i*6+1]=IMPACT.y; streakPos2[i*6+2]=IMPACT.z;
        streakPos2[i*6+3]=IMPACT.x; streakPos2[i*6+4]=IMPACT.y; streakPos2[i*6+5]=IMPACT.z;
        streakLife2[i] = 0.25 + Math.random() * 0.48;
      };

      let strikeActive = false;
      let strikeTimer  = 0;

      triggerRef.current = () => {
        strikeActive = true; strikeTimer = 0;
        for (let i = 0; i < SPARKS;  i++) resetStreak(i);
        for (let i = 0; i < SPARKS2; i++) resetStreak2(i);
        streakLines.visible  = true;
        streakLines2.visible = true;
        strikeLight.intensity = 28;
      };

      // ── Animation ────────────────────────────────────────────────────────────
      let t = 0;
      let lastPhase: CraftPhase = 'IDLE';
      let rafId: number;
      const DT = 0.016;

      const animate = () => {
        rafId = requestAnimationFrame(animate);
        t += DT;
        const phase = craftPhaseRef.current;
        const boost = upgradeLevelRef.current * 0.22;

        // ── Fire flicker — 3 independent noise sums ──────────────────────────
        const n1 = Math.sin(t * 8.2) * 1.1 + Math.sin(t * 3.4) * 0.65 + Math.sin(t * 18.8) * 0.35;
        const n2 = Math.sin(t * 5.8) * 0.9 + Math.sin(t * 2.3) * 0.55 + Math.sin(t * 12.1) * 0.30;
        const n3 = Math.sin(t * 7.1) * 0.8 + Math.sin(t * 4.6) * 0.42;
        const nL = Math.sin(t * 3.1) * 0.5 + Math.sin(t * 7.7) * 0.25;

        fireMain.intensity  = (22.0 + boost * 1.3) + n1 * 2.2;
        fireFill.intensity  = (12.0 + boost * 0.9) + n2 * 1.6;
        fireFloor.intensity = (8.0  + boost * 0.6) + n3 * 1.1;
        // Lantern flicker — slower, candle-like
        lanternLight.intensity = 5.0 + nL * 0.8;

        // Fire planes scale/flicker
        fp1.scale.set(1 + n1 * 0.06, 1 + n1 * 0.07, 1);
        fp2.scale.set(1 + n2 * 0.07, 1 + n2 * 0.09, 1);
        fp3.scale.set(1 + n3 * 0.08, 1 + n3 * 0.11, 1);
        (fireMat1 as THREE.MeshStandardMaterial).emissiveIntensity  = 9.0  + n1 * 2.8;
        (fireMat2 as THREE.MeshStandardMaterial).emissiveIntensity  = 7.0  + n2 * 2.4;
        (fireMat3 as THREE.MeshStandardMaterial).emissiveIntensity  = 11.0 + n3 * 3.2;
        (glowCoreMat as THREE.MeshStandardMaterial).emissiveIntensity = 16.0 + n1 * 3.5;
        (lanternMat as THREE.MeshStandardMaterial).emissiveIntensity  = 6.0  + nL * 1.2;

        // ── Camera gentle sway (breathing feel) ─────────────────────────────
        camera.position.y = 11.5 + Math.sin(t * 0.22) * 0.12;
        camera.position.x = 3.5  + Math.sin(t * 0.09) * 0.08;
        camera.lookAt(0.0, 0.0, 0.5);

        // ── Phase transitions ────────────────────────────────────────────────
        if (phase !== lastPhase) {
          if (phase === 'HEATING') {
            metalPiece.visible = true;
            // metal starts in furnace
            metalPiece.position.set(-0.5, 0.72, -3.2);
            metalMat.emissiveIntensity = 0;
            ambPts.visible = true;
          }
          if (phase === 'HAMMERING') {
            metalPiece.visible = true;
            ambPts.visible = false;
          }
          if (phase === 'IDLE' || phase === 'RESULT') {
            metalPiece.visible = false;
            metalMat.emissiveIntensity = 0;
            metalGlow.intensity = 0;
            ambPts.visible = false;
          }
          if (phase === 'COOLING') {
            ambPts.visible = false;
          }
          lastPhase = phase;
        }

        // ── Per-phase ────────────────────────────────────────────────────────
        if (phase === 'HEATING') {
          metalMat.emissiveIntensity = Math.min(3.8, metalMat.emissiveIntensity + 0.010);
          metalMat.emissive.setHex(0xFF4400);
          metalGlow.intensity = metalMat.emissiveIntensity * 1.8;
          fireMain.intensity  = (26.0 + boost) + n1 * 2.8;
          fireFill.intensity  = (15.0 + boost) + n2 * 2.0;
          // Ambient furnace sparks rise
          for (let i = 0; i < AMB; i++) {
            ambLife[i] -= DT;
            if (ambLife[i] <= 0) resetAmb(i);
            ambPos[i*3]   += ambVel[i].x;
            ambPos[i*3+1] += ambVel[i].y;
            ambPos[i*3+2] += ambVel[i].z;
            ambVel[i].y   -= 0.0006;
          }
          ambGeo.attributes.position.needsUpdate = true;
        }

        if (phase === 'HAMMERING') {
          // Metal on active anvil, glowing orange-hot
          metalPiece.position.x = THREE.MathUtils.lerp(metalPiece.position.x, IMPACT.x, 0.05);
          metalPiece.position.z = THREE.MathUtils.lerp(metalPiece.position.z, IMPACT.z, 0.05);
          metalPiece.position.y = THREE.MathUtils.lerp(metalPiece.position.y, 1.10, 0.04);
          metalMat.emissiveIntensity = 2.5 + Math.sin(t * 5.0) * 0.50;
          metalMat.emissive.setHex(0xFF5500);
          metalGlow.intensity = metalMat.emissiveIntensity * 3.0;
          strikeLight.position.copy(IMPACT).y += 0.8;
        }

        if (phase === 'COOLING') {
          metalPiece.visible = true;
          // Metal moves toward water trough
          metalPiece.position.x = THREE.MathUtils.lerp(metalPiece.position.x, 2.8, 0.015);
          metalPiece.position.z = THREE.MathUtils.lerp(metalPiece.position.z, 3.5, 0.015);
          metalPiece.position.y = THREE.MathUtils.lerp(metalPiece.position.y, 0.38, 0.015);
          metalMat.emissiveIntensity = Math.max(0, metalMat.emissiveIntensity - 0.010);
          metalMat.color.lerp(new THREE.Color(0x5A5A5A), 0.010);
          metalGlow.intensity = Math.max(0, metalGlow.intensity - 0.040);
        }

        // ── Strike sparks ─────────────────────────────────────────────────────
        if (strikeActive) {
          strikeTimer += DT;
          strikeLight.intensity = Math.max(0, 28 - strikeTimer * 60);

          for (let i = 0; i < SPARKS; i++) {
            streakLife[i] -= DT;
            if (streakLife[i] <= 0) { resetStreak(i); continue; }
            streakPos[i*6+3] += streakVel[i].x;
            streakPos[i*6+4] += streakVel[i].y;
            streakPos[i*6+5] += streakVel[i].z;
            streakVel[i].y -= 0.009;
            const lag = 0.62;
            streakPos[i*6]   = THREE.MathUtils.lerp(streakPos[i*6],   streakPos[i*6+3], 1-lag);
            streakPos[i*6+1] = THREE.MathUtils.lerp(streakPos[i*6+1], streakPos[i*6+4], 1-lag);
            streakPos[i*6+2] = THREE.MathUtils.lerp(streakPos[i*6+2], streakPos[i*6+5], 1-lag);
          }
          streakGeo.attributes.position.needsUpdate = true;

          for (let i = 0; i < SPARKS2; i++) {
            streakLife2[i] -= DT;
            if (streakLife2[i] <= 0) { resetStreak2(i); continue; }
            streakPos2[i*6+3] += streakVel2[i].x;
            streakPos2[i*6+4] += streakVel2[i].y;
            streakPos2[i*6+5] += streakVel2[i].z;
            streakVel2[i].y -= 0.011;
            const lag = 0.68;
            streakPos2[i*6]   = THREE.MathUtils.lerp(streakPos2[i*6],   streakPos2[i*6+3], 1-lag);
            streakPos2[i*6+1] = THREE.MathUtils.lerp(streakPos2[i*6+1], streakPos2[i*6+4], 1-lag);
            streakPos2[i*6+2] = THREE.MathUtils.lerp(streakPos2[i*6+2], streakPos2[i*6+5], 1-lag);
          }
          streakGeo2.attributes.position.needsUpdate = true;

          if (strikeTimer > 2.0) {
            strikeActive = false;
            streakLines.visible  = false;
            streakLines2.visible = false;
            strikeLight.intensity = 0;
          }
        }

        // ── Smoke ────────────────────────────────────────────────────────────
        for (let i = 0; i < SMOKE; i++) {
          smokeLife[i] -= 0.005;
          if (smokeLife[i] <= 0) resetSmoke(i);
          smokePos[i*3]   += smokeVel[i].x;
          smokePos[i*3+1] += smokeVel[i].y;
          smokePos[i*3+2] += smokeVel[i].z;
        }
        smokeGeo.attributes.position.needsUpdate = true;

        renderer.render(scene, camera);
        gl.endFrameEXP();
      };
      animate();

      cleanupRef.current = () => {
        cancelAnimationFrame(rafId);
        renderer.dispose();
        streakGeo.dispose();
        streakGeo2.dispose();
        ambGeo.dispose();
        smokeGeo.dispose();
      };
    }, []);

    if (!webglOk) return <ForgeFallback craftPhase={craftPhase} />;
    return <GLView style={styles.gl} onContextCreate={onContextCreate} />;
  },
);

ForgeScene3D.displayName = 'ForgeScene3D';
export default ForgeScene3D;

const styles = StyleSheet.create({
  gl: { flex: 1 },
  fallback: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  fbGlow: {
    position: 'absolute', left: '8%', top: '22%',
    width: 100, height: 100, borderRadius: 50, backgroundColor: '#FF440028',
  },
  fbLabel: {
    position: 'absolute', bottom: '12%',
    fontSize: 16, fontWeight: '800', color: '#D4851A', letterSpacing: 3,
  },
});
