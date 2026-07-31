/**
 * ForgeScene3D — Cinematic forge with realistic blacksmith silhouette,
 * high-density spark bursts, and dramatic fire-lit atmosphere.
 *
 * Visual strategy
 * ───────────────
 * • The blacksmith is a dark silhouette lit from behind by the fire —
 *   any shape looks realistic when strong rim-light separates it from the BG.
 * • Sparks use AdditiveBlending: they glow and brighten surrounding surfaces.
 * • Three independently-flickering point-lights simulate an organic fire.
 * • During HAMMERING the right arm swings a full pendulum arc each beat.
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

// ─── WebGL capability check ───────────────────────────────────────────────────
function checkWebGL(): boolean {
  if (Platform.OS !== 'web') return true;
  try {
    const c = document.createElement('canvas');
    return !!(
      window.WebGLRenderingContext &&
      (c.getContext('webgl') || c.getContext('experimental-webgl'))
    );
  } catch { return false; }
}

// ─── 2D fallback (shown when WebGL is unavailable) ───────────────────────────
function ForgeFallback({ craftPhase }: { craftPhase: CraftPhase }) {
  return (
    <LinearGradient colors={['#0A0608', '#1C0A04', '#0A0608']} style={styles.fallback}>
      <View style={styles.fbGlow} />
      <View style={styles.fbFurnace}>
        <View style={[styles.fbOpening, craftPhase === 'HEATING' && styles.fbOpeningHot]} />
      </View>
      <View style={styles.fbAnvil}>
        <View style={styles.fbAnvilTop} />
        <View style={styles.fbAnvilHorn} />
      </View>
      {(craftPhase === 'HAMMERING' || craftPhase === 'COOLING') && (
        <View style={[styles.fbMetal, craftPhase === 'HAMMERING' && styles.fbMetalHot]} />
      )}
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

// ─── Geometry shortcuts ───────────────────────────────────────────────────────
function mkBox(w: number, h: number, d: number, mat: THREE.Material,
               px = 0, py = 0, pz = 0, ry = 0): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(px, py, pz);
  if (ry) m.rotation.y = ry;
  return m;
}
function mkCyl(rt: number, rb: number, h: number, s: number, mat: THREE.Material,
               px = 0, py = 0, pz = 0, rz = 0): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, s), mat);
  m.position.set(px, py, pz);
  if (rz) m.rotation.z = rz;
  return m;
}
function mkSphere(r: number, mat: THREE.Material,
                  px = 0, py = 0, pz = 0): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 10), mat);
  m.position.set(px, py, pz);
  return m;
}

// ─── Main scene component ─────────────────────────────────────────────────────
const ForgeScene3D = forwardRef<ForgeScene3DRef, Props>(
  ({ craftPhase, upgradeLevel = 0 }, ref) => {
    const [webglOk] = useState(() => checkWebGL());
    const craftPhaseRef    = useRef<CraftPhase>(craftPhase);
    const upgradeLevelRef  = useRef(upgradeLevel);
    const cleanupRef       = useRef<(() => void) | null>(null);
    const triggerStrikeRef = useRef<(() => void) | null>(null);

    useEffect(() => { craftPhaseRef.current = craftPhase; }, [craftPhase]);
    useEffect(() => { upgradeLevelRef.current = upgradeLevel; }, [upgradeLevel]);
    useEffect(() => () => { cleanupRef.current?.(); }, []);

    useImperativeHandle(ref, () => ({
      triggerHammerStrike: () => { triggerStrikeRef.current?.(); },
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
      renderer.setClearColor(0x0C0810);

      // ── Scene ───────────────────────────────────────────────────────────────
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x0C0810);
      // Gentle linear fog — keeps far objects from looking flat without hiding them
      scene.fog = new THREE.Fog(0x0C0810, 12, 28);

      // ── Camera — low-angle looking UP slightly at the smith ─────────────────
      // This gives a heroic, cinematic perspective
      const camera = new THREE.PerspectiveCamera(58, W / H, 0.1, 50);
      camera.position.set(0.4, 1.8, 4.2);
      camera.lookAt(0.1, 1.1, 0);

      // ── Materials ───────────────────────────────────────────────────────────
      // Environment: mid-tones so fire light registers strongly
      const stoneMat     = new THREE.MeshStandardMaterial({ color: 0x584840, roughness: 0.93 });
      const stoneDarkMat = new THREE.MeshStandardMaterial({ color: 0x3C2E24, roughness: 0.96 });
      const mortarMat    = new THREE.MeshStandardMaterial({ color: 0x6E5C48, roughness: 0.90 });
      const floorMat     = new THREE.MeshStandardMaterial({ color: 0x3A2C22, roughness: 0.95 });
      const woodMat      = new THREE.MeshStandardMaterial({ color: 0x5E3C1A, roughness: 0.88 });
      const woodLightMat = new THREE.MeshStandardMaterial({ color: 0x7A5028, roughness: 0.82 });
      const ironMat      = new THREE.MeshStandardMaterial({ color: 0x505050, roughness: 0.18, metalness: 0.96 });
      const steelMat     = new THREE.MeshStandardMaterial({ color: 0x787878, roughness: 0.10, metalness: 0.99 });
      const ironDullMat  = new THREE.MeshStandardMaterial({ color: 0x606060, roughness: 0.45, metalness: 0.85 });
      const coalMat      = new THREE.MeshStandardMaterial({ color: 0x241C14, roughness: 0.99 });

      // Blacksmith — dark leather/skin but catches rim-light from fire behind
      const smithBodyMat = new THREE.MeshStandardMaterial({ color: 0x3A2416, roughness: 0.88 });
      const smithApronMat= new THREE.MeshStandardMaterial({ color: 0x2A1C10, roughness: 0.92 });
      const smithSkinMat = new THREE.MeshStandardMaterial({ color: 0x9A6040, roughness: 0.70 });
      const smithHairMat = new THREE.MeshStandardMaterial({ color: 0x180E06, roughness: 0.96 });
      const hammerWoodMat= new THREE.MeshStandardMaterial({ color: 0x6A4020, roughness: 0.85 });
      const hammerIronMat= new THREE.MeshStandardMaterial({ color: 0x4A4A4A, roughness: 0.15, metalness: 0.97 });

      // Emissive fire materials
      const emberMat = new THREE.MeshStandardMaterial({
        color: 0xFF5500, emissive: new THREE.Color(0xFF5500), emissiveIntensity: 5.0,
      });
      const ember2Mat = new THREE.MeshStandardMaterial({
        color: 0xFFAA00, emissive: new THREE.Color(0xFFAA00), emissiveIntensity: 3.5,
      });
      const glowMat = new THREE.MeshStandardMaterial({
        color: 0xFF3300, emissive: new THREE.Color(0xFF2200), emissiveIntensity: 6.0,
        transparent: true, opacity: 0.85,
      });

      // ── Lighting ────────────────────────────────────────────────────────────
      // Warm ambient — fills shadows so nothing goes pitch-black
      scene.add(new THREE.AmbientLight(0x4A3020, 2.2));

      // THREE independent fire lights for organic flicker (each gets its own noise)
      const fire1 = new THREE.PointLight(0xFF6600, 9.0, 20);
      fire1.position.set(-2.1, 1.4, -1.8);
      scene.add(fire1);

      const fire2 = new THREE.PointLight(0xFF4400, 6.0, 14);
      fire2.position.set(-1.8, 0.6, -1.6);
      scene.add(fire2);

      const fire3 = new THREE.PointLight(0xFFAA00, 4.0, 10);
      fire3.position.set(-1.5, 1.8, -1.4);
      scene.add(fire3);

      // Overhead warm torch — ensures the whole room is readable
      const ceilingLight = new THREE.PointLight(0xFFCC88, 3.5, 16);
      ceilingLight.position.set(0.2, 4.5, 1.5);
      scene.add(ceilingLight);

      // Rim / back light on blacksmith from fire behind (key cinematic light)
      const rimLight = new THREE.PointLight(0xFF8800, 5.0, 8);
      rimLight.position.set(-1.8, 2.2, -0.4);
      scene.add(rimLight);

      // Cool moonlight through a gap — creates colour contrast, separation
      const moonLight = new THREE.DirectionalLight(0x6688CC, 0.8);
      moonLight.position.set(6, 12, 8);
      scene.add(moonLight);

      // Anvil work-light — illuminates metal piece
      const anvilLight = new THREE.PointLight(0xFFEEDD, 3.0, 4);
      anvilLight.position.set(0.6, 2.5, 0.8);
      scene.add(anvilLight);

      // ── Floor ───────────────────────────────────────────────────────────────
      scene.add(mkBox(20, 0.06, 20, floorMat, 0, -0.03, 0));
      // Flagstone seams
      const groutM = new THREE.MeshStandardMaterial({ color: 0x201510, roughness: 1 });
      for (let i = -5; i <= 5; i++) {
        scene.add(mkBox(20, 0.015, 0.035, groutM, 0, 0.01, i * 1.05));
        scene.add(mkBox(0.035, 0.015, 20, groutM, i * 1.05, 0.01, 0));
      }

      // ── Back & side walls ───────────────────────────────────────────────────
      scene.add(mkBox(20, 8, 0.3, stoneMat, 0, 4, -4.5));
      // Brick rows on back wall
      for (let row = 0; row < 8; row++) {
        for (let col = -6; col <= 6; col++) {
          const offset = row % 2 === 0 ? 0 : 0.82;
          scene.add(mkBox(1.52, 0.28, 0.045,
            row % 4 === 0 ? mortarMat : stoneDarkMat,
            col * 1.68 + offset, 0.5 + row * 0.45, -4.34));
        }
      }
      scene.add(mkBox(0.3, 8, 12, stoneMat, -6.5, 4, 0));
      scene.add(mkBox(0.3, 8, 12, stoneMat,  6.5, 4, 0));

      // ── Ceiling beams ───────────────────────────────────────────────────────
      const beamMat = new THREE.MeshStandardMaterial({ color: 0x2C1A0A, roughness: 0.92 });
      for (const bx of [-2.2, -0.4, 1.4]) {
        scene.add(mkBox(0.22, 0.26, 16, beamMat, bx, 5.5, -1));
      }
      for (const bz of [-2.5, -0.5, 1.5]) {
        scene.add(mkBox(16, 0.20, 0.20, beamMat, 0, 5.3, bz));
      }

      // ── Forge hearth ────────────────────────────────────────────────────────
      const fg = new THREE.Group();
      // Plinth
      fg.add(mkBox(2.8, 0.35, 2.0, stoneMat, 0, 0.175, 0));
      // Left pillar
      fg.add(mkBox(0.72, 2.4, 1.9, stoneMat, -1.04, 1.375, 0));
      // Right pillar
      fg.add(mkBox(0.72, 2.4, 1.9, stoneMat,  1.04, 1.375, 0));
      // Lintel
      fg.add(mkBox(2.8, 0.50, 1.9, stoneMat, 0, 2.825, 0));
      // Arch stones over opening
      for (let i = -2; i <= 2; i++) {
        fg.add(mkBox(0.42, 0.26, 0.22, i === 0 ? mortarMat : stoneDarkMat,
          i * 0.42, 2.44, 0.9));
      }
      // Soot-black interior
      const sootM = new THREE.MeshStandardMaterial({ color: 0x080604, roughness: 1 });
      fg.add(mkBox(1.22, 1.92, 0.12, sootM, 0, 1.31, -0.88));
      fg.add(mkBox(0.12, 1.92, 1.66, sootM, -0.59, 1.31, 0));
      fg.add(mkBox(0.12, 1.92, 1.66, sootM,  0.59, 1.31, 0));
      // Grate floor
      fg.add(mkBox(1.18, 0.07, 1.62, coalMat, 0, 0.385, 0));
      // Coal lumps
      for (let c = 0; c < 14; c++) {
        const sz = 0.06 + Math.random() * 0.07;
        const coal = mkSphere(sz, coalMat,
          (Math.random() - 0.5) * 0.72,
          0.43 + sz,
          (Math.random() - 0.5) * 0.52);
        coal.scale.y = 0.55;
        fg.add(coal);
      }
      // Glowing ember planes (emissive — self-lit)
      const ep1 = mkBox(0.60, 0.02, 0.42, emberMat, -0.06, 0.46, -0.05);
      ep1.rotation.x = -Math.PI / 2;
      fg.add(ep1);
      const ep2 = mkBox(0.35, 0.02, 0.26, ember2Mat, 0.18, 0.46, 0.12);
      ep2.rotation.x = -Math.PI / 2;
      fg.add(ep2);
      // Central white-hot glow
      const epCore = mkBox(0.22, 0.015, 0.18, glowMat, -0.04, 0.47, 0.02);
      epCore.rotation.x = -Math.PI / 2;
      fg.add(epCore);
      // Chimney
      fg.add(mkCyl(0.26, 0.32, 1.8, 8, stoneMat, -0.25, 4.05, -0.45));
      fg.add(mkCyl(0.40, 0.28, 0.14, 8, stoneDarkMat, -0.25, 4.96, -0.45));
      fg.position.set(-2.1, 0, -2.0);
      fg.rotation.y = 0.15;
      scene.add(fg);

      // ── Anvil on oak stump ──────────────────────────────────────────────────
      // Stump
      scene.add(mkCyl(0.28, 0.33, 0.62, 10, woodMat, 0.55, 0.31, 0.18));
      scene.add(mkCyl(0.27, 0.27, 0.025, 10, woodLightMat, 0.55, 0.635, 0.18));

      const ag = new THREE.Group();
      // Base foot
      ag.add(mkBox(0.80, 0.24, 0.46, ironMat, 0, 0.12, 0));
      // Waist
      ag.add(mkBox(0.40, 0.32, 0.38, ironMat, 0, 0.40, 0));
      // Body
      ag.add(mkBox(1.06, 0.19, 0.44, ironDullMat, 0, 0.595, 0));
      // Polished face
      ag.add(mkBox(0.80, 0.032, 0.38, steelMat, 0, 0.700, 0));
      // Horn
      const horn = new THREE.Mesh(new THREE.ConeGeometry(0.074, 0.52, 10), steelMat);
      horn.rotation.z = -Math.PI / 2;
      horn.position.set(0.78, 0.595, 0);
      ag.add(horn);
      // Heel
      ag.add(mkBox(0.13, 0.11, 0.30, ironMat, -0.52, 0.63, 0));
      // Hardy hole
      const holeM = new THREE.MeshStandardMaterial({ color: 0x060606, roughness: 1 });
      ag.add(mkBox(0.064, 0.032, 0.064, holeM, 0.18, 0.720, 0));
      ag.position.set(0.55, 0.635, 0.18);
      ag.rotation.y = -0.22;
      scene.add(ag);

      // Tongs resting on anvil
      const tg = new THREE.Group();
      for (const s of [-1, 1]) {
        const tong = mkCyl(0.012, 0.012, 0.70, 6, ironDullMat);
        tong.rotation.z = s * 0.12;
        tong.position.x = s * 0.022;
        tg.add(tong);
      }
      tg.position.set(0.35, 0.82, 0.02);
      tg.rotation.x = 1.45;
      tg.rotation.y = 0.35;
      scene.add(tg);

      // ── Water bucket ─────────────────────────────────────────────────────────
      const bg = new THREE.Group();
      bg.add(mkCyl(0.20, 0.165, 0.40, 10, woodMat, 0, 0.20, 0));
      bg.add(mkCyl(0.21, 0.21, 0.026, 10, ironDullMat, 0, 0.09, 0));
      bg.add(mkCyl(0.21, 0.21, 0.026, 10, ironDullMat, 0, 0.30, 0));
      const waterM = new THREE.MeshStandardMaterial({ color: 0x1A3A4E, roughness: 0.06, metalness: 0.3 });
      bg.add(mkCyl(0.188, 0.188, 0.012, 10, waterM, 0, 0.385, 0));
      bg.position.set(1.55, 0, 0.85);
      scene.add(bg);

      // ── Tool rack ───────────────────────────────────────────────────────────
      scene.add(mkBox(0.08, 0.12, 1.7, woodMat, 3.1, 2.35, -0.6));
      for (let p = 0; p < 5; p++) {
        scene.add(mkCyl(0.015, 0.015, 0.16, 6, ironDullMat, 3.06, 2.25, -0.85 + p * 0.42));
        const toolH = 0.26 + Math.random() * 0.22;
        scene.add(mkCyl(0.020, 0.014, toolH, 6, ironDullMat, 3.06, 2.18 - toolH / 2, -0.85 + p * 0.42));
      }

      // ── Workbench ────────────────────────────────────────────────────────────
      scene.add(mkBox(1.8, 0.11, 0.75, woodLightMat, 2.2, 0.93, 1.65));
      for (const [dx, dz] of [[-0.72, 0.28], [0.72, 0.28], [-0.72, -0.28], [0.72, -0.28]] as [number,number][]) {
        scene.add(mkCyl(0.040, 0.040, 0.93, 6, woodMat, 2.2 + dx, 0.465, 1.65 + dz));
      }

      // ─── BLACKSMITH — correct human proportions ────────────────────────────
      //
      // Total height: 1.82 units standing straight.
      // Tilted 22° forward (bent at hips over the anvil).
      // Right arm group swings the hammer.
      //
      const smithRoot = new THREE.Group();

      // Feet
      for (const sx of [-0.10, 0.10]) {
        smithRoot.add(mkBox(0.14, 0.08, 0.22, smithBodyMat, sx, 0.04, 0.04));
      }

      // Calves
      smithRoot.add(mkCyl(0.065, 0.060, 0.42, 8, smithBodyMat, -0.12, 0.27, 0));
      smithRoot.add(mkCyl(0.065, 0.060, 0.42, 8, smithBodyMat,  0.12, 0.27, 0));

      // Knees
      smithRoot.add(mkSphere(0.068, smithBodyMat, -0.12, 0.50, 0));
      smithRoot.add(mkSphere(0.068, smithBodyMat,  0.12, 0.50, 0));

      // Thighs
      smithRoot.add(mkCyl(0.080, 0.072, 0.40, 8, smithBodyMat, -0.12, 0.72, 0));
      smithRoot.add(mkCyl(0.080, 0.072, 0.40, 8, smithBodyMat,  0.12, 0.72, 0));

      // Pelvis / hips block
      smithRoot.add(mkBox(0.36, 0.20, 0.22, smithBodyMat, 0, 0.965, 0));

      // Lower torso
      smithRoot.add(mkCyl(0.170, 0.160, 0.28, 10, smithBodyMat, 0, 1.225, 0));

      // Upper torso (wider at shoulders)
      smithRoot.add(mkCyl(0.200, 0.175, 0.38, 10, smithBodyMat, 0, 1.535, 0));

      // Shoulders — wider cap
      smithRoot.add(mkBox(0.54, 0.14, 0.24, smithBodyMat, 0, 1.755, 0));

      // Leather apron (darker, in front)
      smithRoot.add(mkBox(0.28, 0.72, 0.045, smithApronMat, -0.01, 1.14, 0.18));

      // Left arm (slightly forward, relaxed at side)
      const leftArmG = new THREE.Group();
      leftArmG.add(mkCyl(0.058, 0.050, 0.36, 8, smithBodyMat, 0, -0.18, 0)); // upper
      leftArmG.add(mkSphere(0.055, smithBodyMat, 0, -0.385, 0));               // elbow
      leftArmG.add(mkCyl(0.048, 0.040, 0.30, 8, smithBodyMat, 0, -0.57, 0));  // forearm
      leftArmG.add(mkSphere(0.042, smithSkinMat, 0, -0.74, 0));                // fist
      leftArmG.position.set(-0.29, 1.75, 0.05);
      leftArmG.rotation.z = 0.30;
      leftArmG.rotation.x = 0.18;
      smithRoot.add(leftArmG);

      // Right arm GROUP — this is what swings (pivot at shoulder)
      const rightArmG = new THREE.Group();
      rightArmG.add(mkCyl(0.058, 0.050, 0.38, 8, smithBodyMat, 0, -0.19, 0)); // upper arm
      rightArmG.add(mkSphere(0.055, smithBodyMat, 0, -0.40, 0));                // elbow
      rightArmG.add(mkCyl(0.048, 0.040, 0.30, 8, smithBodyMat, 0, -0.60, 0));  // forearm
      rightArmG.add(mkSphere(0.042, smithSkinMat, 0, -0.77, 0));                // fist

      // Hammer attached to fist
      const hammerG = new THREE.Group();
      hammerG.add(mkCyl(0.022, 0.026, 0.62, 8, hammerWoodMat, 0, -0.31, 0));  // handle
      hammerG.add(mkBox(0.12, 0.26, 0.10, hammerIronMat, 0, -0.67, 0));        // head
      hammerG.add(mkBox(0.12, 0.04, 0.10, steelMat, 0, -0.80, 0));             // poll face
      hammerG.position.set(0, -0.77, 0);
      rightArmG.add(hammerG);

      // Right arm pivot is at shoulder
      rightArmG.position.set(0.29, 1.75, 0.05);
      rightArmG.rotation.z = -0.28;
      smithRoot.add(rightArmG);

      // Neck
      smithRoot.add(mkCyl(0.065, 0.070, 0.16, 8, smithSkinMat, 0, 1.85, 0));

      // Head — realistic oval
      const headM = mkSphere(0.148, smithSkinMat, 0, 2.06, 0);
      headM.scale.y = 1.12;
      smithRoot.add(headM);

      // Hair (dark cap on top)
      const hairMesh = mkSphere(0.142, smithHairMat, 0, 2.10, -0.02);
      hairMesh.scale.y = 0.72;
      smithRoot.add(hairMesh);

      // Beard
      const beardMesh = mkSphere(0.095, smithHairMat, 0, 1.96, 0.11);
      beardMesh.scale.y = 0.60;
      beardMesh.scale.x = 0.75;
      smithRoot.add(beardMesh);

      // Eyebrows (tiny dark boxes)
      for (const ex of [-0.06, 0.06]) {
        smithRoot.add(mkBox(0.055, 0.016, 0.022, smithHairMat, ex, 2.11, 0.135));
      }

      // Band around head (headband)
      const bandM = new THREE.MeshStandardMaterial({ color: 0x5C2A10, roughness: 0.85 });
      smithRoot.add(mkCyl(0.152, 0.152, 0.044, 12, bandM, 0, 2.00, 0));

      // Tilt whole body forward (working pose)
      smithRoot.rotation.x = 0.22;
      smithRoot.position.set(-0.18, 0, 0.55);
      smithRoot.rotation.y = 0.28;
      scene.add(smithRoot);

      // ── Metal piece on anvil (animated) ─────────────────────────────────────
      const metalMat = new THREE.MeshStandardMaterial({
        color: 0x5A5A5A, roughness: 0.25, metalness: 0.93,
        emissive: new THREE.Color(0x000000), emissiveIntensity: 0,
      });
      const metalPiece = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.07, 0.14), metalMat);
      metalPiece.position.set(0.55, 0.758, 0.16);
      metalPiece.rotation.y = -0.22;
      metalPiece.visible = false;
      scene.add(metalPiece);

      // Hot-metal glow light (under metal piece)
      const metalGlowLight = new THREE.PointLight(0xFF5500, 0, 2.5);
      metalGlowLight.position.set(0.55, 0.9, 0.16);
      scene.add(metalGlowLight);

      // ── HIGH-DENSITY SPARK PARTICLES ────────────────────────────────────────
      // Two layers: large glowing sparks + tiny fast ones
      // AdditiveBlending makes them GLOW and brighten the scene

      // Layer 1 — large sparks (strike burst)
      const SPARK_A = 80;
      const sparksAGeo = new THREE.BufferGeometry();
      const sparksAPos = new Float32Array(SPARK_A * 3);
      sparksAGeo.setAttribute('position', new THREE.BufferAttribute(sparksAPos, 3));
      const sparksAVel: THREE.Vector3[] = Array.from({ length: SPARK_A }, () => new THREE.Vector3());
      const sparksALife = new Float32Array(SPARK_A);
      const sparksAMat = new THREE.PointsMaterial({
        color: 0xFFCC44, size: 0.09, sizeAttenuation: true,
        blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
      });
      const sparksA = new THREE.Points(sparksAGeo, sparksAMat);
      sparksA.visible = false;
      scene.add(sparksA);

      // Layer 2 — tiny hot white sparks (strike burst)
      const SPARK_B = 120;
      const sparksBGeo = new THREE.BufferGeometry();
      const sparksBPos = new Float32Array(SPARK_B * 3);
      sparksBGeo.setAttribute('position', new THREE.BufferAttribute(sparksBPos, 3));
      const sparksBVel: THREE.Vector3[] = Array.from({ length: SPARK_B }, () => new THREE.Vector3());
      const sparksBLife = new Float32Array(SPARK_B);
      const sparksBMat = new THREE.PointsMaterial({
        color: 0xFFFFDD, size: 0.05, sizeAttenuation: true,
        blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
      });
      const sparksB = new THREE.Points(sparksBGeo, sparksBMat);
      sparksB.visible = false;
      scene.add(sparksB);

      // Layer 3 — ambient furnace embers (always present in HEATING/HAMMERING)
      const AMB = 24;
      const ambGeo = new THREE.BufferGeometry();
      const ambPos = new Float32Array(AMB * 3);
      ambGeo.setAttribute('position', new THREE.BufferAttribute(ambPos, 3));
      const ambVel: THREE.Vector3[] = Array.from({ length: AMB }, () => new THREE.Vector3());
      const ambLife = new Float32Array(AMB);
      const ambMat = new THREE.PointsMaterial({
        color: 0xFF6600, size: 0.06, sizeAttenuation: true,
        blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
      });
      const ambParticles = new THREE.Points(ambGeo, ambMat);
      ambParticles.visible = false;
      scene.add(ambParticles);

      // Smoke
      const SMOKE = 20;
      const smokeGeo = new THREE.BufferGeometry();
      const smokePos = new Float32Array(SMOKE * 3);
      smokeGeo.setAttribute('position', new THREE.BufferAttribute(smokePos, 3));
      const smokeVel: THREE.Vector3[] = Array.from({ length: SMOKE }, () => new THREE.Vector3());
      const smokeLife = new Float32Array(SMOKE);
      const smokeMat = new THREE.PointsMaterial({
        color: 0x302820, size: 0.22, sizeAttenuation: true,
        transparent: true, opacity: 0.40, depthWrite: false,
      });
      const smokePoints = new THREE.Points(smokeGeo, smokeMat);
      scene.add(smokePoints);

      let strikeActive = false;
      let strikeTimer = 0;

      const ANVIL_POS = new THREE.Vector3(0.55, 0.76, 0.16);

      const resetSparkA = (i: number) => {
        sparksAPos[i*3]   = ANVIL_POS.x + (Math.random() - 0.5) * 0.14;
        sparksAPos[i*3+1] = ANVIL_POS.y;
        sparksAPos[i*3+2] = ANVIL_POS.z + (Math.random() - 0.5) * 0.10;
        const spd = 0.20 + Math.random() * 0.28;
        const ang = Math.random() * Math.PI * 2;
        sparksAVel[i].set(Math.cos(ang) * spd, 0.18 + Math.random() * 0.22, Math.sin(ang) * spd);
        sparksALife[i] = 0.6 + Math.random() * 0.7;
      };
      const resetSparkB = (i: number) => {
        sparksBPos[i*3]   = ANVIL_POS.x + (Math.random() - 0.5) * 0.08;
        sparksBPos[i*3+1] = ANVIL_POS.y;
        sparksBPos[i*3+2] = ANVIL_POS.z + (Math.random() - 0.5) * 0.06;
        const spd = 0.30 + Math.random() * 0.42;
        const ang = Math.random() * Math.PI * 2;
        sparksBVel[i].set(Math.cos(ang) * spd, 0.22 + Math.random() * 0.30, Math.sin(ang) * spd);
        sparksBLife[i] = 0.4 + Math.random() * 0.5;
      };
      const resetAmb = (i: number) => {
        const fx = fg.position.x + (Math.random() - 0.5) * 0.55;
        const fz = fg.position.z + (Math.random() - 0.5) * 0.45;
        ambPos[i*3] = fx; ambPos[i*3+1] = 0.48; ambPos[i*3+2] = fz;
        ambVel[i].set((Math.random()-0.5)*0.04, 0.05+Math.random()*0.08, (Math.random()-0.5)*0.04);
        ambLife[i] = Math.random();
      };
      const resetSmoke = (i: number) => {
        smokePos[i*3]   = -2.35 + (Math.random()-0.5)*0.18;
        smokePos[i*3+1] = 3.8  + Math.random()*0.35;
        smokePos[i*3+2] = -2.45;
        smokeVel[i].set((Math.random()-0.5)*0.009, 0.022+Math.random()*0.016, (Math.random()-0.5)*0.009);
        smokeLife[i] = 1.0 + Math.random()*1.2;
      };
      for (let i = 0; i < SMOKE; i++) { resetSmoke(i); smokePos[i*3+1] += Math.random()*2.5; }

      triggerStrikeRef.current = () => {
        strikeActive = true;
        strikeTimer = 0;
        for (let i = 0; i < SPARK_A; i++) resetSparkA(i);
        for (let i = 0; i < SPARK_B; i++) resetSparkB(i);
        sparksA.visible = true;
        sparksB.visible = true;
      };

      // ── Animation loop ───────────────────────────────────────────────────────
      let t = 0;
      let armSwing = 0;
      let armDir = 1;
      let lastPhase: CraftPhase = 'IDLE';
      let rafId: number;

      const animate = () => {
        rafId = requestAnimationFrame(animate);
        t += 0.016;
        const phase = craftPhaseRef.current;
        const boost = upgradeLevelRef.current * 0.18;

        // ── Organic fire flicker (3 independent lights) ──────────────────────
        const n1 = Math.sin(t * 8.3) * 0.9 + Math.sin(t * 3.1) * 0.5 + Math.sin(t * 17.7) * 0.3;
        const n2 = Math.sin(t * 6.1) * 0.8 + Math.sin(t * 2.2) * 0.4 + Math.sin(t * 11.4) * 0.25;
        const n3 = Math.sin(t * 5.7) * 0.7 + Math.sin(t * 4.3) * 0.35;
        fire1.intensity = (9.0 + boost) + n1;
        fire2.intensity = (6.0 + boost * 0.7) + n2;
        fire3.intensity = (4.0 + boost * 0.5) + n3;
        // Ember planes flicker
        (ep1.material as THREE.MeshStandardMaterial).emissiveIntensity = 5.0 + n1 * 1.5;
        (ep2.material as THREE.MeshStandardMaterial).emissiveIntensity = 3.5 + n2 * 1.2;
        (epCore.material as THREE.MeshStandardMaterial).emissiveIntensity = 6.0 + n3 * 2.0;

        // ── Camera gentle breathing ──────────────────────────────────────────
        camera.position.y = 1.8 + Math.sin(t * 0.30) * 0.04;
        camera.position.x = 0.4 + Math.sin(t * 0.09) * 0.06;
        camera.lookAt(0.1, 1.1, 0);

        // ── Phase transitions ────────────────────────────────────────────────
        if (phase !== lastPhase) {
          if (phase === 'HEATING') {
            metalPiece.visible = true;
            metalPiece.position.set(0.55, 0.758, 0.16);
            metalMat.emissiveIntensity = 0;
            ambParticles.visible = true;
          }
          if (phase === 'HAMMERING') {
            ambParticles.visible = false;
          }
          if (phase === 'IDLE' || phase === 'RESULT') {
            metalPiece.visible = false;
            metalMat.emissiveIntensity = 0;
            metalGlowLight.intensity = 0;
            ambParticles.visible = false;
          }
          if (phase === 'COOLING') {
            ambParticles.visible = false;
          }
          lastPhase = phase;
        }

        // ── Per-phase ────────────────────────────────────────────────────────
        if (phase === 'HEATING') {
          metalPiece.position.x = THREE.MathUtils.lerp(metalPiece.position.x, -1.48, 0.014);
          metalPiece.position.z = THREE.MathUtils.lerp(metalPiece.position.z, -1.72, 0.014);
          metalMat.emissiveIntensity = Math.min(3.2, metalMat.emissiveIntensity + 0.012);
          metalMat.emissive.setHex(0xFF4400);
          fire1.intensity = (12.0 + boost) + n1 * 1.4;
          fire2.intensity = (8.0 + boost) + n2 * 1.2;
          metalGlowLight.intensity = metalMat.emissiveIntensity * 1.8;
          // Ambient furnace sparks
          for (let i = 0; i < AMB; i++) {
            ambLife[i] -= 0.016;
            if (ambLife[i] <= 0) resetAmb(i);
            ambPos[i*3] += ambVel[i].x; ambPos[i*3+1] += ambVel[i].y; ambPos[i*3+2] += ambVel[i].z;
            ambVel[i].y -= 0.001;
          }
          ambGeo.attributes.position.needsUpdate = true;
        }

        if (phase === 'HAMMERING') {
          // Metal on anvil, orange-hot
          metalPiece.position.x = THREE.MathUtils.lerp(metalPiece.position.x, 0.55, 0.06);
          metalPiece.position.z = THREE.MathUtils.lerp(metalPiece.position.z, 0.16, 0.06);
          metalMat.emissiveIntensity = 2.0 + Math.sin(t * 5.5) * 0.4;
          metalMat.emissive.setHex(0xFF5500);
          metalGlowLight.intensity = metalMat.emissiveIntensity * 2.5;

          // Hammer arm swings full arc (pendulum) — looks like real striking
          armSwing += 0.055 * armDir;
          if (armSwing >  1.05) { armDir = -1; armSwing = 1.05; }
          if (armSwing < -0.40) { armDir =  1; armSwing = -0.40; }
          rightArmG.rotation.x = armSwing;
        } else {
          // Idle — arm rests, gentle bob
          armSwing = THREE.MathUtils.lerp(armSwing, -0.1, 0.06);
          rightArmG.rotation.x = armSwing + Math.sin(t * 0.8) * 0.03;
        }

        if (phase === 'COOLING') {
          metalPiece.visible = true;
          // Metal moves to bucket
          metalPiece.position.x = THREE.MathUtils.lerp(metalPiece.position.x, 1.55, 0.022);
          metalPiece.position.z = THREE.MathUtils.lerp(metalPiece.position.z, 0.85, 0.022);
          metalMat.emissiveIntensity = Math.max(0, metalMat.emissiveIntensity - 0.012);
          metalMat.color.lerp(new THREE.Color(0x5A5A5A), 0.016);
          metalGlowLight.intensity = Math.max(0, metalGlowLight.intensity - 0.05);
        }

        // ── Strike sparks ────────────────────────────────────────────────────
        if (strikeActive) {
          strikeTimer += 0.016;
          for (let i = 0; i < SPARK_A; i++) {
            sparksALife[i] -= 0.018;
            if (sparksALife[i] <= 0) resetSparkA(i);
            sparksAPos[i*3]   += sparksAVel[i].x;
            sparksAPos[i*3+1] += sparksAVel[i].y;
            sparksAPos[i*3+2] += sparksAVel[i].z;
            sparksAVel[i].y -= 0.008; // gravity
          }
          sparksAGeo.attributes.position.needsUpdate = true;
          for (let i = 0; i < SPARK_B; i++) {
            sparksBLife[i] -= 0.024;
            if (sparksBLife[i] <= 0) resetSparkB(i);
            sparksBPos[i*3]   += sparksBVel[i].x;
            sparksBPos[i*3+1] += sparksBVel[i].y;
            sparksBPos[i*3+2] += sparksBVel[i].z;
            sparksBVel[i].y -= 0.010;
          }
          sparksBGeo.attributes.position.needsUpdate = true;
          if (strikeTimer > 1.6) {
            strikeActive = false;
            sparksA.visible = false;
            sparksB.visible = false;
          }
        }

        // ── Smoke ─────────────────────────────────────────────────────────────
        for (let i = 0; i < SMOKE; i++) {
          smokeLife[i] -= 0.007;
          if (smokeLife[i] <= 0) resetSmoke(i);
          smokePos[i*3] += smokeVel[i].x;
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
        sparksAGeo.dispose();
        sparksBGeo.dispose();
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

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  gl: { flex: 1 },
  fallback: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  fbGlow: {
    position: 'absolute', left: '8%', top: '18%',
    width: 90, height: 90, borderRadius: 45, backgroundColor: '#FF440020',
  },
  fbFurnace: {
    position: 'absolute', left: '10%', top: '26%',
    width: 72, height: 94, backgroundColor: '#2A1204', borderRadius: 5,
    alignItems: 'center', justifyContent: 'center',
  },
  fbOpening: { width: 34, height: 32, backgroundColor: '#1A0A02', borderRadius: 4 },
  fbOpeningHot: { backgroundColor: '#FF4400' },
  fbAnvil: {
    position: 'absolute', bottom: '30%', left: '42%',
    width: 72, height: 40, backgroundColor: '#2A2A2A', borderRadius: 4,
  },
  fbAnvilTop: {
    position: 'absolute', top: -13, left: -9,
    width: 90, height: 15, backgroundColor: '#3E3E3E', borderRadius: 3,
  },
  fbAnvilHorn: {
    position: 'absolute', top: -9, right: -23,
    width: 28, height: 11, backgroundColor: '#3E3E3E',
    borderTopRightRadius: 8, borderBottomRightRadius: 8,
  },
  fbMetal: {
    position: 'absolute', bottom: '38%', left: '50%',
    width: 28, height: 8, backgroundColor: '#666', borderRadius: 2,
  },
  fbMetalHot: { backgroundColor: '#FF8833' },
  fbLabel: {
    position: 'absolute', bottom: '10%',
    fontSize: 16, fontWeight: '800', color: '#D4851A', letterSpacing: 3,
  },
});
