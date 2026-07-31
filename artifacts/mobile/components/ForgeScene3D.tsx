/**
 * ForgeScene3D — Cinematic close-up of a blacksmith hammering.
 *
 * Visual strategy (matches reference photo)
 * ──────────────────────────────────────────
 * • Camera is LOW and CLOSE — anvil surface fills the lower frame.
 * • Only forearms + hammer are visible — no uncanny full-body puppet.
 * • Fire rages in the background left, casting intense orange rim light.
 * • Sparks are LINE SEGMENTS (streaks) not dots — photorealistic trails.
 * • Strike flash: brief point-light burst at impact point.
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
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 10), mat);
  m.position.set(px, py, pz);
  return m;
}

// ─── Main component ───────────────────────────────────────────────────────────
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
      renderer.setClearColor(0x050306);

      // ── Scene ───────────────────────────────────────────────────────────────
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x050306);
      scene.fog = new THREE.FogExp2(0x050306, 0.09);

      // ── Camera — tight close-up, low angle, side view like the photo ────────
      // Camera is at anvil-surface height, slightly to the right and close
      const camera = new THREE.PerspectiveCamera(52, W / H, 0.05, 30);
      camera.position.set(1.6, 0.85, 1.9);
      camera.lookAt(0.1, 0.62, 0.0);

      // ── Materials ───────────────────────────────────────────────────────────
      const ironMat   = new THREE.MeshStandardMaterial({ color: 0x303030, roughness: 0.20, metalness: 0.96 });
      const steelMat  = new THREE.MeshStandardMaterial({ color: 0x686868, roughness: 0.08, metalness: 0.99 });
      const ironDark  = new THREE.MeshStandardMaterial({ color: 0x1E1E1E, roughness: 0.45, metalness: 0.90 });
      const woodMat   = new THREE.MeshStandardMaterial({ color: 0x3E2208, roughness: 0.90 });
      const woodLight = new THREE.MeshStandardMaterial({ color: 0x5C3414, roughness: 0.82 });
      const stoneMat  = new THREE.MeshStandardMaterial({ color: 0x3C3028, roughness: 0.95 });
      const floorMat  = new THREE.MeshStandardMaterial({ color: 0x1A1210, roughness: 0.98 });
      const leatherMat= new THREE.MeshStandardMaterial({ color: 0x2A1408, roughness: 0.90 });
      const gloveMat  = new THREE.MeshStandardMaterial({ color: 0x1C0E06, roughness: 0.85 });
      const skinMat   = new THREE.MeshStandardMaterial({ color: 0x8A5030, roughness: 0.72 });
      const hammerHdl = new THREE.MeshStandardMaterial({ color: 0x4A2C0E, roughness: 0.86 });
      const hammerHd  = new THREE.MeshStandardMaterial({ color: 0x383838, roughness: 0.14, metalness: 0.97 });
      const hammerFace= new THREE.MeshStandardMaterial({ color: 0x707070, roughness: 0.06, metalness: 0.99 });

      const metalMat  = new THREE.MeshStandardMaterial({
        color: 0x5A5A5A, roughness: 0.22, metalness: 0.95,
        emissive: new THREE.Color(0x000000), emissiveIntensity: 0,
      });
      const coalMat   = new THREE.MeshStandardMaterial({ color: 0x181210, roughness: 1.0 });

      // Fire glow planes (emissive self-lit)
      const fireMat1  = new THREE.MeshStandardMaterial({
        color: 0xFF4400, emissive: new THREE.Color(0xFF3300), emissiveIntensity: 8.0,
        transparent: true, opacity: 0.85, side: THREE.DoubleSide,
      });
      const fireMat2  = new THREE.MeshStandardMaterial({
        color: 0xFF8800, emissive: new THREE.Color(0xFF7700), emissiveIntensity: 6.0,
        transparent: true, opacity: 0.70, side: THREE.DoubleSide,
      });
      const fireMat3  = new THREE.MeshStandardMaterial({
        color: 0xFFCC44, emissive: new THREE.Color(0xFFBB33), emissiveIntensity: 10.0,
        transparent: true, opacity: 0.55, side: THREE.DoubleSide,
      });
      const emberCoreMat = new THREE.MeshStandardMaterial({
        color: 0xFFFFAA, emissive: new THREE.Color(0xFFFFAA), emissiveIntensity: 14.0,
        transparent: true, opacity: 0.90,
      });

      // ── Lighting ─────────────────────────────────────────────────────────────
      // Very low ambient — almost pitch black; fire does the work
      scene.add(new THREE.AmbientLight(0x1A0C06, 0.8));

      // PRIMARY: massive orange fire light from top-left background
      const fireMain = new THREE.PointLight(0xFF5500, 18.0, 12);
      fireMain.position.set(-2.2, 2.4, -2.5);
      scene.add(fireMain);

      // Secondary fire fill
      const fireFill = new THREE.PointLight(0xFF7700, 10.0, 8);
      fireFill.position.set(-1.8, 1.2, -2.0);
      scene.add(fireFill);

      // Glow from fire floor level
      const fireFloor = new THREE.PointLight(0xFF9900, 7.0, 6);
      fireFloor.position.set(-1.6, 0.3, -1.8);
      scene.add(fireFloor);

      // Cool top-right hair-light for separation
      const hairLight = new THREE.DirectionalLight(0x4466AA, 0.6);
      hairLight.position.set(4, 6, 3);
      scene.add(hairLight);

      // Strike flash — brief burst at impact point
      const strikeLight = new THREE.PointLight(0xFFEEAA, 0, 3);
      strikeLight.position.set(0.1, 0.78, 0.1);
      scene.add(strikeLight);

      // Anvil work-light — subtle fill to see the metal piece
      const anvilFill = new THREE.PointLight(0xFF8844, 4.0, 3);
      anvilFill.position.set(0.8, 1.6, 0.6);
      scene.add(anvilFill);

      // Metal-glow light
      const metalGlow = new THREE.PointLight(0xFF5500, 0, 2.5);
      metalGlow.position.set(0.0, 0.9, 0.0);
      scene.add(metalGlow);

      // ── Floor ────────────────────────────────────────────────────────────────
      scene.add(mkBox(14, 0.06, 14, floorMat, 0, -0.03, 0));

      // ── Back wall ────────────────────────────────────────────────────────────
      const wallMat = new THREE.MeshStandardMaterial({ color: 0x1A1410, roughness: 0.98 });
      scene.add(mkBox(14, 9, 0.20, wallMat, 0, 4.5, -3.6));
      // Brick texture overlay rows
      const brickMat = new THREE.MeshStandardMaterial({ color: 0x262018, roughness: 0.96 });
      for (let row = 0; row < 6; row++) {
        for (let col = -4; col <= 4; col++) {
          const offset = row % 2 === 0 ? 0 : 0.88;
          scene.add(mkBox(1.60, 0.28, 0.04, brickMat, col * 1.72 + offset, 0.5 + row * 0.46, -3.50));
        }
      }
      // Left wall
      scene.add(mkBox(0.20, 9, 10, wallMat, -5.0, 4.5, 0));

      // ── Anvil on heavy oak stump — very prominent ─────────────────────────
      // Stump
      scene.add(mkCyl(0.38, 0.44, 0.72, 12, woodMat, 0.0, 0.36, 0.0));
      // Stump top ring
      scene.add(mkCyl(0.385, 0.385, 0.025, 12, woodLight, 0.0, 0.732, 0.0));
      // Root buttress
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2;
        const rx = Math.cos(a) * 0.38;
        const rz = Math.sin(a) * 0.38;
        const root = mkBox(0.12, 0.28, 0.22, woodMat, rx, 0.16, rz);
        root.rotation.y = a;
        scene.add(root);
      }

      // Anvil body group
      const anvil = new THREE.Group();
      // Base foot — wide heavy base
      anvil.add(mkBox(1.10, 0.28, 0.60, ironDark, 0, 0.14, 0));
      // Waist taper
      anvil.add(mkBox(0.52, 0.34, 0.50, ironDark, 0, 0.45, 0));
      // Shoulder
      anvil.add(mkBox(1.20, 0.16, 0.56, ironMat, 0, 0.66, 0));
      // Body / table
      anvil.add(mkBox(1.14, 0.20, 0.52, ironMat, 0, 0.84, 0));
      // Polished working face
      anvil.add(mkBox(0.95, 0.035, 0.44, steelMat, -0.04, 0.950, 0));
      // Horn (tapered cone)
      const horn = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.66, 12), steelMat);
      horn.rotation.z = -Math.PI / 2;
      horn.position.set(0.90, 0.840, 0);
      anvil.add(horn);
      // Heel
      anvil.add(mkBox(0.16, 0.13, 0.38, ironDark, -0.60, 0.83, 0));
      // Hardy hole
      const holeM = new THREE.MeshStandardMaterial({ color: 0x040404, roughness: 1 });
      anvil.add(mkBox(0.075, 0.038, 0.075, holeM, 0.22, 0.968, 0));
      // Pritchel hole
      anvil.add(mkBox(0.042, 0.038, 0.042, holeM, 0.36, 0.968, -0.12));

      anvil.position.set(0.0, 0.732, 0.0);
      anvil.rotation.y = 0.12;
      scene.add(anvil);

      // ── Metal piece on anvil ─────────────────────────────────────────────────
      const metalPiece = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.08, 0.15), metalMat);
      metalPiece.position.set(0.0, 1.72, 0.04);
      metalPiece.rotation.y = 0.12;
      metalPiece.visible = false;
      scene.add(metalPiece);

      // ── FORGE FURNACE — background left, blazing ─────────────────────────────
      const forge = new THREE.Group();
      // Stone surround
      forge.add(mkBox(2.6, 3.2, 0.25, stoneMat, 0, 1.6, 0));
      // Opening (dark interior)
      const sootM = new THREE.MeshStandardMaterial({ color: 0x060402, roughness: 1 });
      forge.add(mkBox(1.10, 1.60, 0.30, sootM, 0, 1.12, 0.03));
      // Lintel
      forge.add(mkBox(2.6, 0.42, 0.26, stoneMat, 0, 2.32, 0));
      // Side pillars
      forge.add(mkBox(0.72, 1.60, 0.26, stoneMat, -0.91, 1.12, 0));
      forge.add(mkBox(0.72, 1.60, 0.26, stoneMat,  0.91, 1.12, 0));
      // Plinth
      forge.add(mkBox(2.6, 0.35, 0.25, stoneMat, 0, 0.175, 0));
      // Coal grate floor
      forge.add(mkBox(1.06, 0.06, 0.20, coalMat, 0, 0.37, 0.04));
      // Coal lumps
      for (let c = 0; c < 16; c++) {
        const sz = 0.055 + Math.random() * 0.065;
        const coal = mkSphere(sz, coalMat,
          (Math.random() - 0.5) * 0.72, 0.39 + sz * 0.6,
          (Math.random() - 0.5) * 0.12);
        coal.scale.y = 0.52;
        forge.add(coal);
      }
      // FIRE — three layers of emissive planes at the opening
      // Outer orange glow
      const fp1 = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 1.30), fireMat1);
      fp1.position.set(0, 1.0, 0.10);
      forge.add(fp1);
      // Mid hot yellow-orange
      const fp2 = new THREE.Mesh(new THREE.PlaneGeometry(0.65, 0.95), fireMat2);
      fp2.position.set(0.06, 0.92, 0.13);
      forge.add(fp2);
      // Core hot white
      const fp3 = new THREE.Mesh(new THREE.PlaneGeometry(0.35, 0.50), fireMat3);
      fp3.position.set(-0.04, 0.80, 0.16);
      forge.add(fp3);
      // Ember core
      const fpCore = mkSphere(0.12, emberCoreMat, 0, 0.55, 0.14);
      forge.add(fpCore);

      // Chimney
      forge.add(mkCyl(0.28, 0.34, 2.0, 8, stoneMat, 0.0, 4.28, 0.0));

      forge.position.set(-2.6, 0.0, -2.4);
      forge.rotation.y = 0.18;
      scene.add(forge);

      // ── BLACKSMITH ARMS — close-up only, no full body ─────────────────────
      // Camera shows from mid-chest level. Only forearms, wrists, hands, and
      // the hammer are visible. This matches the reference photo exactly.

      // RIGHT ARM + HAMMER (hammer hand — the striking arm)
      const rightArm = new THREE.Group();

      // Upper arm (partially visible at top of frame)
      rightArm.add(mkCyl(0.095, 0.085, 0.55, 10, leatherMat, 0, 0.275, 0));
      // Forearm — thicker, muscular
      rightArm.add(mkCyl(0.085, 0.072, 0.42, 10, skinMat, 0, -0.05, 0));
      // Wrist
      rightArm.add(mkSphere(0.075, skinMat, 0, -0.29, 0));
      // Gloved hand (heavy work glove)
      const rHand = new THREE.Group();
      rHand.add(mkBox(0.13, 0.10, 0.16, gloveMat, 0, 0, 0));         // palm
      rHand.add(mkBox(0.13, 0.04, 0.06, gloveMat, 0, -0.07, -0.11)); // fingers curl
      rHand.position.set(0, -0.37, 0);
      rightArm.add(rHand);

      // HAMMER — gripped firmly
      const hammerG = new THREE.Group();
      // Handle (hickory wood)
      hammerG.add(mkCyl(0.028, 0.032, 0.78, 8, hammerHdl, 0, -0.39, 0));
      // Head body
      hammerG.add(mkBox(0.14, 0.32, 0.115, hammerHd, 0, -0.88, 0));
      // Striking face (polished steel)
      hammerG.add(mkBox(0.14, 0.04, 0.115, hammerFace, 0, -1.05, 0));
      // Peen (back of head — slightly tapered)
      const peenM = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.065, 0.15, 8), hammerHd);
      peenM.rotation.x = Math.PI / 2;
      peenM.position.set(0, -0.74, -0.088);
      hammerG.add(peenM);
      // Wedge at handle junction
      hammerG.add(mkBox(0.025, 0.03, 0.10, steelMat, 0, -0.72, 0));

      hammerG.position.set(0, -0.41, 0);
      rightArm.add(hammerG);

      // Right arm: angled downward, swings in X (toward anvil)
      rightArm.position.set(-0.36, 2.48, -0.20);
      rightArm.rotation.set(-0.45, 0.20, 0.15);
      scene.add(rightArm);

      // LEFT ARM (holding tongs — slightly in front)
      const leftArm = new THREE.Group();
      // Upper arm
      leftArm.add(mkCyl(0.092, 0.082, 0.50, 10, leatherMat, 0, 0.25, 0));
      // Forearm
      leftArm.add(mkCyl(0.082, 0.070, 0.40, 10, skinMat, 0, -0.04, 0));
      // Wrist/hand gloved
      leftArm.add(mkSphere(0.073, gloveMat, 0, -0.28, 0));
      const lHand = new THREE.Group();
      lHand.add(mkBox(0.12, 0.09, 0.15, gloveMat, 0, 0, 0));
      lHand.add(mkBox(0.12, 0.04, 0.06, gloveMat, 0, -0.065, -0.10));
      lHand.position.set(0, -0.35, 0);
      leftArm.add(lHand);

      // Tongs in left hand
      const tongsG = new THREE.Group();
      for (const s of [-1, 1]) {
        const jaw = mkCyl(0.014, 0.014, 0.52, 6, ironDark);
        jaw.rotation.z = s * 0.09;
        jaw.position.x = s * 0.018;
        tongsG.add(jaw);
        // Jaw tip (gripping the hot metal)
        const tip = mkBox(0.025, 0.055, 0.03, ironDark, s * 0.018, -0.285, 0);
        tongsG.add(tip);
      }
      tongsG.position.set(0, -0.38, 0);
      tongsG.rotation.x = -0.25;
      leftArm.add(tongsG);

      // Left arm: reaches forward over the anvil, holding the work
      leftArm.position.set(0.52, 2.22, -0.35);
      leftArm.rotation.set(-0.82, -0.28, -0.12);
      scene.add(leftArm);

      // ── Partial torso / chest (dark, in background) ─────────────────────────
      // Just enough to avoid a floating-arms look
      const torsoG = new THREE.Group();
      // Chest
      torsoG.add(mkBox(0.68, 0.55, 0.34, leatherMat, 0, 0, 0));
      // Leather apron bib
      torsoG.add(mkBox(0.44, 0.62, 0.05, new THREE.MeshStandardMaterial({ color: 0x150A04, roughness: 0.92 }), 0, -0.12, 0.18));
      torsoG.position.set(0.08, 2.72, -0.38);
      torsoG.rotation.x = 0.32;
      torsoG.rotation.y = 0.18;
      scene.add(torsoG);

      // ── Workbench / table in right mid-ground ───────────────────────────────
      scene.add(mkBox(1.4, 0.12, 0.65, woodLight, 2.4, 0.96, 0.80));
      for (const [dx, dz] of [[-0.55, 0.24], [0.55, 0.24], [-0.55, -0.24], [0.55, -0.24]] as [number,number][]) {
        scene.add(mkCyl(0.038, 0.038, 0.96, 6, woodMat, 2.4 + dx, 0.48, 0.80 + dz));
      }
      // Some tools on bench
      for (let i = 0; i < 3; i++) {
        scene.add(mkCyl(0.018, 0.012, 0.30 + i * 0.08, 6, ironDark, 2.1 + i * 0.22, 1.03, 0.72));
      }

      // ── Water bucket ────────────────────────────────────────────────────────
      const bucket = new THREE.Group();
      bucket.add(mkCyl(0.22, 0.18, 0.42, 10, woodMat, 0, 0.21, 0));
      bucket.add(mkCyl(0.225, 0.225, 0.026, 10, ironDark, 0, 0.08, 0));
      bucket.add(mkCyl(0.225, 0.225, 0.026, 10, ironDark, 0, 0.34, 0));
      const waterM = new THREE.MeshStandardMaterial({ color: 0x0E2030, roughness: 0.04, metalness: 0.4 });
      bucket.add(mkCyl(0.210, 0.210, 0.012, 10, waterM, 0, 0.412, 0));
      bucket.position.set(2.0, 0.0, -0.60);
      scene.add(bucket);

      // ── Smoke particles ──────────────────────────────────────────────────────
      const SMOKE = 18;
      const smokeGeo = new THREE.BufferGeometry();
      const smokePos = new Float32Array(SMOKE * 3);
      smokeGeo.setAttribute('position', new THREE.BufferAttribute(smokePos, 3));
      const smokeVel: THREE.Vector3[] = Array.from({ length: SMOKE }, () => new THREE.Vector3());
      const smokeLife = new Float32Array(SMOKE);
      const smokeMat = new THREE.PointsMaterial({
        color: 0x221814, size: 0.28, sizeAttenuation: true,
        transparent: true, opacity: 0.35, depthWrite: false,
      });
      const smokePts = new THREE.Points(smokeGeo, smokeMat);
      scene.add(smokePts);

      const resetSmoke = (i: number) => {
        smokePos[i*3]   = -2.6  + (Math.random() - 0.5) * 0.22;
        smokePos[i*3+1] = 3.5   + Math.random() * 0.3;
        smokePos[i*3+2] = -2.44;
        smokeVel[i].set((Math.random()-0.5)*0.008, 0.018+Math.random()*0.014, (Math.random()-0.5)*0.008);
        smokeLife[i] = 1.2 + Math.random() * 1.5;
      };
      for (let i = 0; i < SMOKE; i++) {
        resetSmoke(i);
        smokePos[i*3+1] += Math.random() * 2.8;
      }

      // ── SPARK STREAKS — line segments, not dots ──────────────────────────────
      // Each spark = a line from tail to head, giving the photo-realistic streak look.
      const SPARKS = 160;
      const streakPositions = new Float32Array(SPARKS * 6); // 2 vertices × 3 coords per spark
      const streakGeo = new THREE.BufferGeometry();
      streakGeo.setAttribute('position', new THREE.BufferAttribute(streakPositions, 3));
      // Draw pairs: [i*6..i*6+2] = tail, [i*6+3..i*6+5] = head
      const streakVel: THREE.Vector3[] = Array.from({ length: SPARKS }, () => new THREE.Vector3());
      const streakLife = new Float32Array(SPARKS);
      const streakMaxLife = new Float32Array(SPARKS);

      const streakMat = new THREE.LineSegments(
        streakGeo,
        new THREE.LineBasicMaterial({
          color: 0xFFCC44,
          blending: THREE.AdditiveBlending,
          transparent: true,
          depthWrite: false,
          vertexColors: false,
        })
      );
      streakMat.visible = false;
      scene.add(streakMat);

      // Secondary tiny white sparks (also streaks)
      const SPARKS2 = 80;
      const streakPos2 = new Float32Array(SPARKS2 * 6);
      const streakGeo2 = new THREE.BufferGeometry();
      streakGeo2.setAttribute('position', new THREE.BufferAttribute(streakPos2, 3));
      const streakVel2: THREE.Vector3[] = Array.from({ length: SPARKS2 }, () => new THREE.Vector3());
      const streakLife2 = new Float32Array(SPARKS2);
      const streakMaxLife2 = new Float32Array(SPARKS2);
      const streakMat2 = new THREE.LineSegments(
        streakGeo2,
        new THREE.LineBasicMaterial({
          color: 0xFFFFEE,
          blending: THREE.AdditiveBlending,
          transparent: true,
          depthWrite: false,
        })
      );
      streakMat2.visible = false;
      scene.add(streakMat2);

      // Ambient furnace sparks (points, always on during heating)
      const AMB = 28;
      const ambGeo = new THREE.BufferGeometry();
      const ambPos = new Float32Array(AMB * 3);
      ambGeo.setAttribute('position', new THREE.BufferAttribute(ambPos, 3));
      const ambVel: THREE.Vector3[] = Array.from({ length: AMB }, () => new THREE.Vector3());
      const ambLife = new Float32Array(AMB);
      const ambMat = new THREE.PointsMaterial({
        color: 0xFF6600, size: 0.07, sizeAttenuation: true,
        blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
      });
      const ambPts = new THREE.Points(ambGeo, ambMat);
      ambPts.visible = false;
      scene.add(ambPts);

      const IMPACT = new THREE.Vector3(0.04, 0.97, 0.06); // hammer-on-anvil world position

      const resetStreak = (i: number) => {
        // Random direction fan — sparks fly radially from impact
        const spd = 0.28 + Math.random() * 0.55;
        // Bias upward and to the sides (matches photo: sparks fan up and sideways)
        const elev = 0.15 + Math.random() * 0.75; // mostly upward
        const azim = Math.random() * Math.PI * 2;
        streakVel[i].set(
          Math.cos(azim) * Math.cos(elev) * spd,
          Math.sin(elev) * spd * 0.9,
          Math.sin(azim) * Math.cos(elev) * spd,
        );
        // Start at impact point
        streakPositions[i*6]   = IMPACT.x;
        streakPositions[i*6+1] = IMPACT.y;
        streakPositions[i*6+2] = IMPACT.z;
        streakPositions[i*6+3] = IMPACT.x;
        streakPositions[i*6+4] = IMPACT.y;
        streakPositions[i*6+5] = IMPACT.z;
        const life = 0.35 + Math.random() * 0.65;
        streakLife[i] = life;
        streakMaxLife[i] = life;
      };
      const resetStreak2 = (i: number) => {
        const spd = 0.40 + Math.random() * 0.70;
        const elev = 0.20 + Math.random() * 0.80;
        const azim = Math.random() * Math.PI * 2;
        streakVel2[i].set(
          Math.cos(azim) * Math.cos(elev) * spd,
          Math.sin(elev) * spd * 1.1,
          Math.sin(azim) * Math.cos(elev) * spd,
        );
        streakPos2[i*6]   = IMPACT.x;
        streakPos2[i*6+1] = IMPACT.y;
        streakPos2[i*6+2] = IMPACT.z;
        streakPos2[i*6+3] = IMPACT.x;
        streakPos2[i*6+4] = IMPACT.y;
        streakPos2[i*6+5] = IMPACT.z;
        const life = 0.25 + Math.random() * 0.45;
        streakLife2[i] = life;
        streakMaxLife2[i] = life;
      };
      const resetAmb = (i: number) => {
        const fx = forge.position.x + (Math.random() - 0.5) * 0.55;
        const fz = forge.position.z + (Math.random() - 0.5) * 0.25;
        ambPos[i*3] = fx; ambPos[i*3+1] = 0.48; ambPos[i*3+2] = fz;
        ambVel[i].set((Math.random()-0.5)*0.04, 0.05+Math.random()*0.09, (Math.random()-0.5)*0.025);
        ambLife[i] = Math.random();
      };
      for (let i = 0; i < AMB; i++) resetAmb(i);

      let strikeActive = false;
      let strikeTimer  = 0;

      triggerStrikeRef.current = () => {
        strikeActive = true;
        strikeTimer  = 0;
        for (let i = 0; i < SPARKS;  i++) resetStreak(i);
        for (let i = 0; i < SPARKS2; i++) resetStreak2(i);
        streakMat.visible  = true;
        streakMat2.visible = true;
        strikeLight.intensity = 22;
      };

      // ── Animation ────────────────────────────────────────────────────────────
      let t        = 0;
      let armSwing = -0.45;
      let armDir   = 1;
      let lastPhase: CraftPhase = 'IDLE';
      let rafId: number;
      const DT = 0.016;

      const animate = () => {
        rafId = requestAnimationFrame(animate);
        t += DT;
        const phase = craftPhaseRef.current;
        const boost = upgradeLevelRef.current * 0.20;

        // ── Fire flicker — 3 independent noise sums ──────────────────────────
        const n1 = Math.sin(t * 8.4) * 1.0 + Math.sin(t * 3.2) * 0.6 + Math.sin(t * 19.1) * 0.35;
        const n2 = Math.sin(t * 5.9) * 0.8 + Math.sin(t * 2.1) * 0.5 + Math.sin(t * 12.3) * 0.28;
        const n3 = Math.sin(t * 7.3) * 0.7 + Math.sin(t * 4.5) * 0.40;

        fireMain.intensity = (18.0 + boost * 1.2) + n1 * 2.0;
        fireFill.intensity = (10.0 + boost * 0.8) + n2 * 1.4;
        fireFloor.intensity= (7.0  + boost * 0.5) + n3 * 1.0;

        // Fire plane flicker (scale + opacity)
        const fScale = 1.0 + n1 * 0.06;
        fp1.scale.set(1.0 + n1 * 0.05, fScale, 1);
        fp2.scale.set(1.0 + n2 * 0.07, 1.0 + n2 * 0.08, 1);
        fp3.scale.set(1.0 + n3 * 0.08, 1.0 + n3 * 0.10, 1);
        fp1.position.y = forge.position.y === 0 ? 1.0 + n1 * 0.04 : fp1.position.y;
        (fireMat1 as THREE.MeshStandardMaterial).emissiveIntensity = 8.0  + n1 * 2.5;
        (fireMat2 as THREE.MeshStandardMaterial).emissiveIntensity = 6.0  + n2 * 2.0;
        (fireMat3 as THREE.MeshStandardMaterial).emissiveIntensity = 10.0 + n3 * 3.0;
        (emberCoreMat as THREE.MeshStandardMaterial).emissiveIntensity = 14.0 + n1 * 3.0;

        // ── Camera subtle breathing ──────────────────────────────────────────
        camera.position.y = 0.85 + Math.sin(t * 0.28) * 0.025;
        camera.position.x = 1.60 + Math.sin(t * 0.11) * 0.04;
        camera.lookAt(0.1, 0.62, 0.0);

        // ── Phase transitions ────────────────────────────────────────────────
        if (phase !== lastPhase) {
          if (phase === 'HEATING') {
            metalPiece.visible = true;
            metalPiece.position.set(-1.88, 0.82, -1.94); // in furnace
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

        // ── Per-phase updates ────────────────────────────────────────────────
        if (phase === 'HEATING') {
          // Metal lerps into furnace
          metalPiece.position.x = THREE.MathUtils.lerp(metalPiece.position.x, -1.88, 0.010);
          metalPiece.position.z = THREE.MathUtils.lerp(metalPiece.position.z, -1.94, 0.010);
          metalMat.emissiveIntensity = Math.min(3.5, metalMat.emissiveIntensity + 0.010);
          metalMat.emissive.setHex(0xFF4400);
          metalGlow.intensity = metalMat.emissiveIntensity * 1.6;
          // Ambient furnace sparks
          for (let i = 0; i < AMB; i++) {
            ambLife[i] -= DT;
            if (ambLife[i] <= 0) resetAmb(i);
            ambPos[i*3]   += ambVel[i].x;
            ambPos[i*3+1] += ambVel[i].y;
            ambPos[i*3+2] += ambVel[i].z;
            ambVel[i].y   -= 0.0008;
          }
          ambGeo.attributes.position.needsUpdate = true;
          fireMain.intensity = (22.0 + boost) + n1 * 2.5;
          fireFill.intensity = (13.0 + boost) + n2 * 1.8;
        }

        if (phase === 'HAMMERING') {
          // Metal on anvil
          metalPiece.position.x = THREE.MathUtils.lerp(metalPiece.position.x, 0.04, 0.06);
          metalPiece.position.z = THREE.MathUtils.lerp(metalPiece.position.z, 0.06, 0.06);
          metalPiece.position.y = THREE.MathUtils.lerp(metalPiece.position.y, 1.72, 0.05);
          metalMat.emissiveIntensity = 2.4 + Math.sin(t * 5.2) * 0.45;
          metalMat.emissive.setHex(0xFF5500);
          metalGlow.intensity = metalMat.emissiveIntensity * 2.8;

          // Hammer arm pendulum — wide arc with snap on downswing
          armSwing += 0.065 * armDir;
          if (armSwing >  0.90) { armDir = -1; armSwing =  0.90; }
          if (armSwing < -0.45) { armDir =  1; armSwing = -0.45; }
          rightArm.rotation.x = -0.45 + armSwing;
          // Left arm slight bob (holding tongs)
          leftArm.rotation.x = -0.82 + Math.sin(t * 4.0) * 0.04;
        } else {
          // Arm at rest
          armSwing = THREE.MathUtils.lerp(armSwing, 0, 0.04);
          rightArm.rotation.x = -0.45 + armSwing + Math.sin(t * 0.9) * 0.025;
        }

        if (phase === 'COOLING') {
          metalPiece.visible = true;
          // Metal moves to bucket
          metalPiece.position.x = THREE.MathUtils.lerp(metalPiece.position.x, 2.0, 0.018);
          metalPiece.position.z = THREE.MathUtils.lerp(metalPiece.position.z, -0.60, 0.018);
          metalPiece.position.y = THREE.MathUtils.lerp(metalPiece.position.y, 0.50, 0.018);
          metalMat.emissiveIntensity = Math.max(0, metalMat.emissiveIntensity - 0.010);
          metalMat.color.lerp(new THREE.Color(0x5A5A5A), 0.012);
          metalGlow.intensity = Math.max(0, metalGlow.intensity - 0.04);
        }

        // ── Strike spark streaks ─────────────────────────────────────────────
        if (strikeActive) {
          strikeTimer += DT;
          // Decay flash
          strikeLight.intensity = Math.max(0, 22 - strikeTimer * 55);

          for (let i = 0; i < SPARKS; i++) {
            streakLife[i] -= DT;
            if (streakLife[i] <= 0) { resetStreak(i); continue; }
            // Move head forward
            streakPositions[i*6+3] += streakVel[i].x;
            streakPositions[i*6+4] += streakVel[i].y;
            streakPositions[i*6+5] += streakVel[i].z;
            streakVel[i].y -= 0.009; // gravity
            // Tail lags behind (creates the streak length)
            const lag = 0.65;
            streakPositions[i*6]   = THREE.MathUtils.lerp(streakPositions[i*6],   streakPositions[i*6+3], 1-lag);
            streakPositions[i*6+1] = THREE.MathUtils.lerp(streakPositions[i*6+1], streakPositions[i*6+4], 1-lag);
            streakPositions[i*6+2] = THREE.MathUtils.lerp(streakPositions[i*6+2], streakPositions[i*6+5], 1-lag);
          }
          streakGeo.attributes.position.needsUpdate = true;

          for (let i = 0; i < SPARKS2; i++) {
            streakLife2[i] -= DT;
            if (streakLife2[i] <= 0) { resetStreak2(i); continue; }
            streakPos2[i*6+3] += streakVel2[i].x;
            streakPos2[i*6+4] += streakVel2[i].y;
            streakPos2[i*6+5] += streakVel2[i].z;
            streakVel2[i].y -= 0.011;
            const lag = 0.70;
            streakPos2[i*6]   = THREE.MathUtils.lerp(streakPos2[i*6],   streakPos2[i*6+3], 1-lag);
            streakPos2[i*6+1] = THREE.MathUtils.lerp(streakPos2[i*6+1], streakPos2[i*6+4], 1-lag);
            streakPos2[i*6+2] = THREE.MathUtils.lerp(streakPos2[i*6+2], streakPos2[i*6+5], 1-lag);
          }
          streakGeo2.attributes.position.needsUpdate = true;

          if (strikeTimer > 1.8) {
            strikeActive = false;
            streakMat.visible  = false;
            streakMat2.visible = false;
            strikeLight.intensity = 0;
          }
        }

        // ── Smoke ────────────────────────────────────────────────────────────
        for (let i = 0; i < SMOKE; i++) {
          smokeLife[i] -= 0.006;
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

// ─── Styles ───────────────────────────────────────────────────────────────────
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
