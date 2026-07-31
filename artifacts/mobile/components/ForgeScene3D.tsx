/**
 * ForgeScene3D — Atmospheric Three.js forge environment.
 * No Lego character — the camera sits inside the workshop, revealing the
 * furnace, anvil, tools, glowing embers, and drifting sparks.
 * Responds to craftPhase to animate glow, sparks, and cooling effects.
 * Exposes triggerHammerStrike() via ref to burst sparks.
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
  } catch {
    return false;
  }
}

// ─── 2D Fallback ─────────────────────────────────────────────────────────────
function ForgeFallback({ craftPhase }: { craftPhase: CraftPhase }) {
  return (
    <LinearGradient colors={['#0A0810', '#1A0A04', '#0A0810']} style={styles.fallback}>
      <View style={styles.furnaceGlow} />
      <View style={styles.furnaceBody}>
        <View style={[styles.furnaceOpening, craftPhase === 'HEATING' && styles.furnaceOpeningActive]} />
      </View>
      <View style={styles.anvilBase}>
        <View style={styles.anvilTop} />
        <View style={styles.anvilHorn} />
      </View>
      {(craftPhase === 'HAMMERING' || craftPhase === 'COOLING') && (
        <View style={[styles.metalPiece, craftPhase === 'HAMMERING' && styles.metalGlow]} />
      )}
      <View style={[styles.floorLine, { backgroundColor: '#2A1A08' }]} />
      <Text style={styles.fallbackLabel}>
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
function box(w: number, h: number, d: number, mat: THREE.Material, px = 0, py = 0, pz = 0, ry = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(px, py, pz);
  if (ry) m.rotation.y = ry;
  return m;
}
function cyl(rt: number, rb: number, h: number, seg: number, mat: THREE.Material, px = 0, py = 0, pz = 0) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
  m.position.set(px, py, pz);
  return m;
}

// ─── Main component ───────────────────────────────────────────────────────────
const ForgeScene3D = forwardRef<ForgeScene3DRef, Props>(({ craftPhase, upgradeLevel = 0 }, ref) => {
  const [webglOk] = useState(() => checkWebGL());
  const craftPhaseRef = useRef<CraftPhase>(craftPhase);
  const upgradeLevelRef = useRef(upgradeLevel);
  const cleanupRef = useRef<(() => void) | null>(null);
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
        addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
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
    renderer.shadowMap.enabled = false;
    renderer.setClearColor(0x080610);

    // ── Scene & camera ────────────────────────────────────────────────────────
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x080610);
    scene.fog = new THREE.FogExp2(0x0A0810, 0.055);

    const camera = new THREE.PerspectiveCamera(52, W / H, 0.1, 50);
    // Camera inside the workshop, slightly elevated, looking at anvil + furnace
    camera.position.set(0, 2.6, 5.2);
    camera.lookAt(0, 1.05, 0);

    // ── Materials ─────────────────────────────────────────────────────────────
    const stoneMat    = new THREE.MeshStandardMaterial({ color: 0x3A3028, roughness: 0.97, metalness: 0.0 });
    const stoneDarkMat= new THREE.MeshStandardMaterial({ color: 0x28201A, roughness: 0.99, metalness: 0.0 });
    const mortarMat   = new THREE.MeshStandardMaterial({ color: 0x4A3E30, roughness: 0.96 });
    const ironMat     = new THREE.MeshStandardMaterial({ color: 0x252525, roughness: 0.20, metalness: 0.96 });
    const ironDullMat = new THREE.MeshStandardMaterial({ color: 0x303030, roughness: 0.48, metalness: 0.85 });
    const steelMat    = new THREE.MeshStandardMaterial({ color: 0x3E3E3E, roughness: 0.12, metalness: 0.98 });
    const woodMat     = new THREE.MeshStandardMaterial({ color: 0x4A2E14, roughness: 0.88 });
    const woodLightMat= new THREE.MeshStandardMaterial({ color: 0x6B4422, roughness: 0.82 });
    const leatherMat  = new THREE.MeshStandardMaterial({ color: 0x5C3A1E, roughness: 0.90 });
    const emberMat    = new THREE.MeshStandardMaterial({
      color: 0xFF3300, emissive: new THREE.Color(0xFF3300), emissiveIntensity: 3.0,
    });
    const coalMat     = new THREE.MeshStandardMaterial({ color: 0x1A1410, roughness: 0.99 });

    // ── Lighting ──────────────────────────────────────────────────────────────
    scene.add(new THREE.AmbientLight(0x0E0A18, 0.4));

    // Primary fire light from furnace
    const fireLight = new THREE.PointLight(0xFF5500, 3.5, 9);
    fireLight.position.set(-2.4, 1.6, -0.2);
    scene.add(fireLight);

    // Secondary ember glow — deep orange
    const emberLight = new THREE.PointLight(0xFF2200, 1.8, 5);
    emberLight.position.set(-2.4, 0.6, 0.1);
    scene.add(emberLight);

    // Cool fill from the back wall (moonlight through a gap)
    const moonLight = new THREE.DirectionalLight(0x4466AA, 0.28);
    moonLight.position.set(4, 8, 6);
    scene.add(moonLight);

    // Anvil highlight — faint white bounce
    const anvilFill = new THREE.PointLight(0xFFEECC, 0.6, 4);
    anvilFill.position.set(0.8, 2.2, 1.0);
    scene.add(anvilFill);

    // ── Floor — cobblestone plane ─────────────────────────────────────────────
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(18, 18), stoneDarkMat);
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);

    // Subtle grout lines across the floor (thin flat boxes)
    const groutMat = new THREE.MeshStandardMaterial({ color: 0x181210, roughness: 1.0 });
    for (let i = -4; i <= 4; i++) {
      const h = box(18, 0.01, 0.04, groutMat, 0, 0.002, i * 0.9);
      scene.add(h);
      const v = box(0.04, 0.01, 18, groutMat, i * 0.9, 0.002, 0);
      scene.add(v);
    }

    // ── Back wall (stone) ─────────────────────────────────────────────────────
    const backWall = box(18, 7, 0.28, stoneMat, 0, 3.5, -3.8);
    scene.add(backWall);
    // Brick rows on back wall
    for (let row = 0; row < 7; row++) {
      for (let col = -5; col <= 5; col++) {
        const offset = row % 2 === 0 ? 0 : 0.75;
        const brick = box(1.38, 0.26, 0.04, row % 3 === 0 ? mortarMat : stoneDarkMat,
          col * 1.52 + offset, 0.44 + row * 0.38, -3.66);
        scene.add(brick);
      }
    }

    // Side walls
    const leftWall  = box(0.28, 7, 12, stoneMat, -5.8, 3.5, 0);
    const rightWall = box(0.28, 7, 12, stoneMat,  5.8, 3.5, 0);
    scene.add(leftWall, rightWall);

    // ── Ceiling beams ─────────────────────────────────────────────────────────
    const beamMat = new THREE.MeshStandardMaterial({ color: 0x2A1A0A, roughness: 0.92 });
    for (const bx of [-1.8, 0, 1.8]) {
      const beam = box(0.18, 0.22, 14, beamMat, bx, 5.0, -1.5);
      scene.add(beam);
    }
    // Cross-beams
    for (const bz of [-2, 0, 2]) {
      const crossBeam = box(14, 0.18, 0.18, beamMat, 0, 4.8, bz);
      scene.add(crossBeam);
    }

    // ── Furnace / Forge Hearth ─────────────────────────────────────────────────
    // Large stone structure against left side of back wall
    const forgeG = new THREE.Group();

    // Base plinth
    forgeG.add(box(2.6, 0.32, 1.8, stoneMat, 0, 0.16, 0));
    // Stone body — left block
    forgeG.add(box(0.7, 2.2, 1.7, stoneMat, -0.95, 1.26, 0));
    // Stone body — right block
    forgeG.add(box(0.7, 2.2, 1.7, stoneMat,  0.95, 1.26, 0));
    // Stone body — top lintel
    forgeG.add(box(2.6, 0.45, 1.7, stoneMat, 0, 2.545, 0));
    // Arch blocks above opening
    for (let i = -2; i <= 2; i++) {
      forgeG.add(box(0.38, 0.22, 0.2, stoneDarkMat, i * 0.38, 2.22, 0.82));
    }

    // Inner back of hearth — black soot
    forgeG.add(box(1.2, 1.78, 0.1, new THREE.MeshStandardMaterial({ color: 0x0A0806, roughness: 1 }), 0, 1.21, -0.82));
    // Inner side walls
    forgeG.add(box(0.1, 1.78, 1.58, new THREE.MeshStandardMaterial({ color: 0x130E08, roughness: 1 }), -0.57, 1.21, 0));
    forgeG.add(box(0.1, 1.78, 1.58, new THREE.MeshStandardMaterial({ color: 0x130E08, roughness: 1 }),  0.57, 1.21, 0));
    // Hearth floor — fire grate
    forgeG.add(box(1.14, 0.06, 1.5, new THREE.MeshStandardMaterial({ color: 0x1A1008, roughness: 0.98 }), 0, 0.34, 0));

    // Coal pile inside hearth
    for (let c = 0; c < 12; c++) {
      const sz = 0.07 + Math.random() * 0.06;
      const coal = new THREE.Mesh(new THREE.SphereGeometry(sz, 5, 4), coalMat);
      coal.position.set(
        (Math.random() - 0.5) * 0.7,
        0.38 + sz * 0.5,
        (Math.random() - 0.5) * 0.5,
      );
      coal.scale.y = 0.55;
      forgeG.add(coal);
    }

    // Glowing ember patches inside hearth (emissive planes)
    const emberPlane1 = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.35), emberMat);
    emberPlane1.rotation.x = -Math.PI / 2;
    emberPlane1.position.set(-0.1, 0.42, -0.1);
    forgeG.add(emberPlane1);
    const emberPlane2 = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.2), emberMat.clone());
    emberPlane2.rotation.x = -Math.PI / 2;
    emberPlane2.position.set(0.2, 0.42, 0.15);
    forgeG.add(emberPlane2);

    // Chimney stack rising from top
    forgeG.add(cyl(0.24, 0.30, 1.6, 8, stoneMat, -0.3, 3.6, -0.4));
    // Chimney cap
    forgeG.add(cyl(0.38, 0.26, 0.12, 8, stoneDarkMat, -0.3, 4.42, -0.4));

    // Smoke hood funnel
    forgeG.add(box(1.8, 0.08, 1.5, stoneDarkMat, 0, 2.74, -0.1));

    forgeG.position.set(-2.2, 0, -2.2);
    forgeG.rotation.y = 0.12;
    scene.add(forgeG);

    // Bellows — leather + wood, next to furnace
    const bellowsG = new THREE.Group();
    bellowsG.add(box(0.18, 0.52, 0.34, woodMat, 0, 0.26, 0));        // body top
    bellowsG.add(box(0.14, 0.42, 0.28, leatherMat, 0, 0.24, 0.02));   // leather pouch
    bellowsG.add(cyl(0.03, 0.04, 0.36, 6, ironDullMat, 0, 0.08, -0.22)); // nozzle
    bellowsG.add(box(0.55, 0.04, 0.12, woodMat, 0, 0.04, 0));          // handle plank
    bellowsG.position.set(-1.1, 1.05, -1.55);
    bellowsG.rotation.y = 0.6;
    bellowsG.rotation.z = 0.22;
    scene.add(bellowsG);

    // ── Anvil ─────────────────────────────────────────────────────────────────
    // Stump base — large section of oak trunk
    const stump = cyl(0.28, 0.32, 0.58, 10, woodMat, 0.6, 0.29, 0.2);
    scene.add(stump);
    // Tree-ring top
    scene.add(cyl(0.27, 0.27, 0.02, 10, woodLightMat, 0.6, 0.585, 0.2));

    const anvilG = new THREE.Group();
    // Bottom foot block
    anvilG.add(box(0.78, 0.22, 0.44, ironMat, 0, 0.11, 0));
    // Tapered waist
    const waistGeo = new THREE.BoxGeometry(0.38, 0.3, 0.36);
    const waist = new THREE.Mesh(waistGeo, ironMat);
    waist.position.y = 0.37;
    anvilG.add(waist);
    // Main body top
    anvilG.add(box(1.04, 0.18, 0.42, ironDullMat, 0, 0.585, 0));
    // Polished working face (slightly lighter)
    anvilG.add(box(0.78, 0.03, 0.36, steelMat, 0, 0.685, 0));
    // Horn — tapered cone
    const hornMesh = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.5, 10), steelMat);
    hornMesh.rotation.z = -Math.PI / 2;
    hornMesh.position.set(0.77, 0.58, 0);
    anvilG.add(hornMesh);
    // Heel block (opposite side)
    anvilG.add(box(0.12, 0.1, 0.3, ironMat, -0.54, 0.62, 0));
    // Hardy hole (dark square cutout illusion)
    anvilG.add(box(0.065, 0.03, 0.065,
      new THREE.MeshStandardMaterial({ color: 0x080808, roughness: 1 }),
      0.18, 0.705, 0));
    // Pritchel hole
    anvilG.add(box(0.038, 0.03, 0.038,
      new THREE.MeshStandardMaterial({ color: 0x080808, roughness: 1 }),
      -0.08, 0.705, 0.06));

    anvilG.position.set(0.6, 0.59, 0.2);
    anvilG.rotation.y = -0.22;
    scene.add(anvilG);

    // ── Hammer on anvil ───────────────────────────────────────────────────────
    // Resting hammer next to anvil on the stump edge
    const hammerG = new THREE.Group();
    const hHandle = cyl(0.022, 0.026, 0.72, 8, woodMat, 0, 0, 0);
    hHandle.rotation.z = Math.PI / 2;
    hammerG.add(hHandle);
    const hHead = box(0.14, 0.22, 0.1, ironMat, 0.2, 0, 0);
    hammerG.add(hHead);
    // Poll face (flat end)
    hammerG.add(box(0.14, 0.04, 0.1, steelMat, 0.27, 0, 0));
    hammerG.position.set(0.65, 0.75, 0.46);
    hammerG.rotation.y = 0.8;
    hammerG.rotation.z = -0.08;
    scene.add(hammerG);

    // ── Tongs (resting on anvil) ───────────────────────────────────────────────
    const tongsG = new THREE.Group();
    for (const side of [-1, 1]) {
      const tong = cyl(0.014, 0.014, 0.68, 6, ironDullMat, side * 0.025, 0, 0);
      tong.rotation.z = side * 0.15;
      tongsG.add(tong);
    }
    tongsG.position.set(0.42, 0.75, -0.02);
    tongsG.rotation.x = 1.4;
    tongsG.rotation.y = 0.3;
    scene.add(tongsG);

    // ── Water quench bucket ───────────────────────────────────────────────────
    const bucketG = new THREE.Group();
    bucketG.add(cyl(0.21, 0.175, 0.38, 10, woodMat, 0, 0.19, 0));
    // Hoops
    for (const hy of [0.08, 0.28]) {
      bucketG.add(cyl(0.22, 0.22, 0.025, 10, ironDullMat, 0, hy, 0));
    }
    // Water surface (dark blue)
    const waterMat = new THREE.MeshStandardMaterial({
      color: 0x1A3A4A, roughness: 0.05, metalness: 0.2,
    });
    bucketG.add(cyl(0.195, 0.195, 0.01, 10, waterMat, 0, 0.365, 0));
    bucketG.position.set(1.6, 0, 0.8);
    scene.add(bucketG);

    // ── Tool rack (right wall) ─────────────────────────────────────────────────
    const rackG = new THREE.Group();
    // Horizontal plank
    rackG.add(box(0.08, 0.1, 1.5, woodMat, 0, 0, 0));
    // Pegs
    for (let p = 0; p < 4; p++) {
      rackG.add(cyl(0.016, 0.016, 0.14, 6, ironDullMat, 0.06, 0, -0.55 + p * 0.36));
    }
    rackG.position.set(3.1, 2.3, -0.8);
    rackG.rotation.y = Math.PI / 2;
    scene.add(rackG);

    // Hanging tools on pegs
    const punchMat = new THREE.MeshStandardMaterial({ color: 0x2A2A2A, roughness: 0.35, metalness: 0.9 });
    for (let p = 0; p < 4; p++) {
      const toolH = 0.28 + Math.random() * 0.2;
      const tool = cyl(0.022, 0.016, toolH, 6, punchMat,
        3.05, 2.12 - toolH / 2, -0.55 + p * 0.36 - 0.75);
      scene.add(tool);
      // Tool head
      const toolHead = cyl(0.036, 0.040, 0.08, 6, ironDullMat,
        3.05, 2.12 - toolH, -0.55 + p * 0.36 - 0.75);
      scene.add(toolHead);
    }

    // ── Workbench (right side) ────────────────────────────────────────────────
    const benchTop = box(1.7, 0.1, 0.72, woodLightMat, 2.2, 0.92, 1.6);
    scene.add(benchTop);
    for (const [dx, dz] of [[-0.7, 0.26], [0.7, 0.26], [-0.7, -0.26], [0.7, -0.26]] as [number,number][]) {
      scene.add(cyl(0.042, 0.042, 0.93, 6, woodMat, 2.2 + dx, 0.465, 1.6 + dz));
    }
    // Items on bench
    scene.add(box(0.2, 0.04, 0.12, steelMat, 2.0, 0.98, 1.5));   // flat bar
    scene.add(box(0.08, 0.08, 0.08, ironDullMat, 2.4, 0.98, 1.58)); // punch block

    // ── Metal piece on anvil (animated) ──────────────────────────────────────
    const metalMat = new THREE.MeshStandardMaterial({
      color: 0x5A5A5A, roughness: 0.28, metalness: 0.92,
      emissive: new THREE.Color(0x000000), emissiveIntensity: 0,
    });
    const metalPiece = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.07, 0.13), metalMat);
    metalPiece.position.set(0.62, 0.745, 0.18);
    metalPiece.rotation.y = -0.22;
    metalPiece.visible = false;
    scene.add(metalPiece);

    // ── Spark particles ───────────────────────────────────────────────────────
    const SPARK_COUNT = 32;
    const sparkGeo = new THREE.BufferGeometry();
    const sparkPosArr = new Float32Array(SPARK_COUNT * 3);
    sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPosArr, 3));
    const sparkVel: THREE.Vector3[] = Array.from({ length: SPARK_COUNT }, () => new THREE.Vector3());
    const sparkLife = new Float32Array(SPARK_COUNT).fill(0);
    const sparkMat = new THREE.PointsMaterial({ color: 0xFFAA00, size: 0.048, sizeAttenuation: true });
    const sparks = new THREE.Points(sparkGeo, sparkMat);
    sparks.visible = false;
    scene.add(sparks);

    // Ambient forge sparks (always present near furnace when heating)
    const AMBIENT_SPARK = 12;
    const ambientGeo = new THREE.BufferGeometry();
    const ambientPos = new Float32Array(AMBIENT_SPARK * 3);
    ambientGeo.setAttribute('position', new THREE.BufferAttribute(ambientPos, 3));
    const ambientVel: THREE.Vector3[] = Array.from({ length: AMBIENT_SPARK }, () => new THREE.Vector3());
    const ambientLife = new Float32Array(AMBIENT_SPARK).fill(0);
    const ambientMat = new THREE.PointsMaterial({ color: 0xFF4400, size: 0.035, sizeAttenuation: true });
    const ambientSparks = new THREE.Points(ambientGeo, ambientMat);
    ambientSparks.visible = false;
    scene.add(ambientSparks);

    // Smoke particles (rise from chimney)
    const SMOKE_COUNT = 18;
    const smokeGeo = new THREE.BufferGeometry();
    const smokePosArr = new Float32Array(SMOKE_COUNT * 3);
    smokeGeo.setAttribute('position', new THREE.BufferAttribute(smokePosArr, 3));
    const smokeVel: THREE.Vector3[] = Array.from({ length: SMOKE_COUNT }, () => new THREE.Vector3());
    const smokeLife = new Float32Array(SMOKE_COUNT);
    const smokeMat = new THREE.PointsMaterial({
      color: 0x303028, size: 0.18, sizeAttenuation: true, transparent: true, opacity: 0.45,
    });
    const smokePoints = new THREE.Points(smokeGeo, smokeMat);
    scene.add(smokePoints);

    let sparkActive = false;
    let sparkTimer = 0;

    const resetSpark = (i: number) => {
      sparkPosArr[i * 3]     = 0.62 + (Math.random() - 0.5) * 0.12;
      sparkPosArr[i * 3 + 1] = 0.78;
      sparkPosArr[i * 3 + 2] = 0.18 + (Math.random() - 0.5) * 0.08;
      sparkVel[i].set(
        (Math.random() - 0.5) * 0.22,
        Math.random() * 0.22 + 0.06,
        (Math.random() - 0.5) * 0.22,
      );
      sparkLife[i] = 0.5 + Math.random() * 0.6;
    };

    const resetAmbientSpark = (i: number) => {
      ambientPos[i * 3]     = -2.2 + (Math.random() - 0.5) * 0.5;
      ambientPos[i * 3 + 1] = 0.5 + Math.random() * 0.4;
      ambientPos[i * 3 + 2] = -2.2 + (Math.random() - 0.5) * 0.5;
      ambientVel[i].set(
        (Math.random() - 0.5) * 0.06,
        Math.random() * 0.09 + 0.03,
        (Math.random() - 0.5) * 0.06,
      );
      ambientLife[i] = Math.random();
    };

    const resetSmoke = (i: number) => {
      smokePosArr[i * 3]     = -2.5 + (Math.random() - 0.5) * 0.18;
      smokePosArr[i * 3 + 1] = 3.5 + Math.random() * 0.3;
      smokePosArr[i * 3 + 2] = -2.6;
      smokeVel[i].set(
        (Math.random() - 0.5) * 0.012,
        0.028 + Math.random() * 0.02,
        (Math.random() - 0.5) * 0.012,
      );
      smokeLife[i] = 1.0 + Math.random();
    };

    // Init smoke
    for (let i = 0; i < SMOKE_COUNT; i++) {
      resetSmoke(i);
      smokePosArr[i * 3 + 1] = 3.5 + Math.random() * 2.5; // distribute vertically
    }

    triggerStrikeRef.current = () => {
      sparkActive = true;
      sparkTimer = 0;
      for (let i = 0; i < SPARK_COUNT; i++) resetSpark(i);
    };

    // ── Hammer floating animation ─────────────────────────────────────────────
    // The hammer gently bobs in idle; swings down during HAMMERING
    let hammerSwingDir = 1;
    let hammerSwing = 0;

    // ── Animate ───────────────────────────────────────────────────────────────
    let t = 0;
    let lastPhase: CraftPhase = 'IDLE';
    let rafId: number;

    const animate = () => {
      rafId = requestAnimationFrame(animate);
      t += 0.016;
      const phase = craftPhaseRef.current;
      const upgradeBoost = upgradeLevelRef.current * 0.15;

      // Fire flicker
      const flicker = Math.sin(t * 7.1) * 0.6 + Math.sin(t * 13.3) * 0.38 + Math.sin(t * 2.7) * 0.2;
      fireLight.intensity  = (3.0 + upgradeBoost) + flicker;
      emberLight.intensity = (1.5 + upgradeBoost * 0.5) + flicker * 0.4;

      // Camera subtle breathing
      camera.position.y = 2.6 + Math.sin(t * 0.32) * 0.04;
      camera.position.x = Math.sin(t * 0.08) * 0.08;
      camera.lookAt(0, 1.05, 0);

      // Phase transitions
      if (phase !== lastPhase) {
        if (phase === 'HEATING') {
          metalPiece.visible = true;
          metalPiece.position.set(0.62, 0.745, 0.18);
          metalMat.emissiveIntensity = 0;
          ambientSparks.visible = true;
        }
        if (phase === 'HAMMERING') {
          ambientSparks.visible = false;
        }
        if (phase === 'IDLE' || phase === 'RESULT') {
          metalPiece.visible = false;
          metalMat.emissiveIntensity = 0;
          ambientSparks.visible = false;
        }
        lastPhase = phase;
      }

      // Per-phase logic
      if (phase === 'HEATING') {
        // Metal drifts toward furnace mouth
        metalPiece.position.x = THREE.MathUtils.lerp(metalPiece.position.x, -1.62, 0.016);
        metalPiece.position.z = THREE.MathUtils.lerp(metalPiece.position.z, -1.9, 0.016);
        metalMat.emissiveIntensity = Math.min(2.8, metalMat.emissiveIntensity + 0.013);
        metalMat.emissive.setHex(0xFF4400);
        (emberPlane1.material as THREE.MeshStandardMaterial).emissiveIntensity = 3.0 + Math.sin(t * 5) * 1.2;
        (emberPlane2.material as THREE.MeshStandardMaterial).emissiveIntensity = 2.5 + Math.sin(t * 8) * 1.0;
        fireLight.intensity = (4.8 + upgradeBoost) + Math.sin(t * 6) * 1.2;
        emberLight.intensity = (3.0 + upgradeBoost * 0.5) + Math.sin(t * 9) * 0.8;

        // Ambient sparks from furnace
        for (let i = 0; i < AMBIENT_SPARK; i++) {
          ambientLife[i] -= 0.018;
          if (ambientLife[i] <= 0) resetAmbientSpark(i);
          ambientPos[i * 3]     += ambientVel[i].x;
          ambientPos[i * 3 + 1] += ambientVel[i].y;
          ambientPos[i * 3 + 2] += ambientVel[i].z;
          ambientVel[i].y -= 0.001;
        }
        ambientGeo.attributes.position.needsUpdate = true;
      }

      if (phase === 'HAMMERING') {
        // Metal back on anvil, hot orange
        metalPiece.position.x = THREE.MathUtils.lerp(metalPiece.position.x, 0.62, 0.06);
        metalPiece.position.z = THREE.MathUtils.lerp(metalPiece.position.z, 0.18, 0.06);
        metalMat.emissiveIntensity = 1.8 + Math.sin(t * 4.5) * 0.3;
        metalMat.emissive.setHex(0xFF5500);

        // Hammer swings during hammering
        hammerSwing += 0.045 * hammerSwingDir;
        if (hammerSwing > 0.4)  hammerSwingDir = -1;
        if (hammerSwing < -0.15) hammerSwingDir =  1;
        hammerG.rotation.z = hammerSwing * 1.2;
        hammerG.position.y = 0.75 + Math.sin(hammerSwing * 3) * 0.06;
      } else {
        // Idle: hammer gently bobs
        hammerG.rotation.z = Math.sin(t * 0.6) * 0.03;
        hammerG.position.y = 0.75 + Math.sin(t * 0.6) * 0.008;
      }

      if (phase === 'COOLING') {
        metalPiece.visible = true;
        metalPiece.position.x = THREE.MathUtils.lerp(metalPiece.position.x, 1.6, 0.025);
        metalPiece.position.z = THREE.MathUtils.lerp(metalPiece.position.z, 0.8, 0.025);
        metalMat.emissiveIntensity = Math.max(0, metalMat.emissiveIntensity - 0.014);
        metalMat.color.lerp(new THREE.Color(0x5A5A5A), 0.018);
        // Water shimmer
        (waterMat as THREE.MeshStandardMaterial).emissiveIntensity = Math.sin(t * 8) * 0.08;
        (waterMat as THREE.MeshStandardMaterial).emissive = new THREE.Color(0x2244AA);
      }

      // Strike sparks
      if (sparkActive) {
        sparkTimer += 0.016;
        sparks.visible = true;
        for (let i = 0; i < SPARK_COUNT; i++) {
          sparkLife[i] -= 0.020;
          if (sparkLife[i] <= 0) resetSpark(i);
          sparkPosArr[i * 3]     += sparkVel[i].x;
          sparkPosArr[i * 3 + 1] += sparkVel[i].y;
          sparkPosArr[i * 3 + 2] += sparkVel[i].z;
          sparkVel[i].y -= 0.006;
        }
        sparkGeo.attributes.position.needsUpdate = true;
        if (sparkTimer > 1.4) { sparkActive = false; sparks.visible = false; }
      }

      // Smoke from chimney (always)
      for (let i = 0; i < SMOKE_COUNT; i++) {
        smokeLife[i] -= 0.008;
        if (smokeLife[i] <= 0) resetSmoke(i);
        smokePosArr[i * 3]     += smokeVel[i].x;
        smokePosArr[i * 3 + 1] += smokeVel[i].y;
        smokePosArr[i * 3 + 2] += smokeVel[i].z;
      }
      smokeGeo.attributes.position.needsUpdate = true;

      renderer.render(scene, camera);
      gl.endFrameEXP();
    };
    animate();

    cleanupRef.current = () => {
      cancelAnimationFrame(rafId);
      renderer.dispose();
      sparkGeo.dispose();
      ambientGeo.dispose();
      smokeGeo.dispose();
    };
  }, []);

  if (!webglOk) return <ForgeFallback craftPhase={craftPhase} />;
  return <GLView style={styles.gl} onContextCreate={onContextCreate} />;
});

ForgeScene3D.displayName = 'ForgeScene3D';
export default ForgeScene3D;

const styles = StyleSheet.create({
  gl: { flex: 1 },
  fallback: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  furnaceGlow: {
    position: 'absolute', left: '8%', top: '20%',
    width: 90, height: 90, borderRadius: 45, backgroundColor: '#FF440022',
  },
  furnaceBody: {
    position: 'absolute', left: '10%', top: '28%',
    width: 70, height: 90, backgroundColor: '#2A1204',
    borderRadius: 4, alignItems: 'center', justifyContent: 'center',
  },
  furnaceOpening: { width: 32, height: 30, backgroundColor: '#221002', borderRadius: 3 },
  furnaceOpeningActive: { backgroundColor: '#FF4400' },
  anvilBase: {
    position: 'absolute', bottom: '32%', left: '42%',
    width: 70, height: 38, backgroundColor: '#2A2A2A', borderRadius: 4,
  },
  anvilTop: {
    position: 'absolute', top: -12, left: -8,
    width: 86, height: 14, backgroundColor: '#3E3E3E', borderRadius: 2,
  },
  anvilHorn: {
    position: 'absolute', top: -8, right: -22,
    width: 26, height: 10, backgroundColor: '#3E3E3E',
    borderTopRightRadius: 8, borderBottomRightRadius: 8,
  },
  metalPiece: {
    position: 'absolute', bottom: '40%', left: '48%',
    width: 28, height: 8, backgroundColor: '#666', borderRadius: 2,
  },
  metalGlow: { backgroundColor: '#FF8833' },
  floorLine: {
    position: 'absolute', bottom: '22%', left: 0, right: 0, height: 2, opacity: 0.4,
  },
  fallbackLabel: {
    position: 'absolute', bottom: '10%',
    fontSize: 16, fontWeight: '800', color: '#D4851A', letterSpacing: 3,
  },
});
