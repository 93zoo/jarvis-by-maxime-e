/**
 * ForgeScene3D — Three.js 3D forge scene via expo-gl.
 * Responds to craftPhase prop to animate heating, hammering, and cooling.
 * Exposes triggerHammerStrike() via ref to play spark particles.
 * Falls back to a 2D atmospheric view when WebGL is unavailable (web preview).
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
    <LinearGradient
      colors={['#0A0810', '#1A0A04', '#0A0810']}
      style={styles.fallback}
    >
      {/* Furnace glow */}
      <View style={styles.furnaceGlow} />
      <View style={styles.furnaceBody}>
        <View style={[styles.furnaceOpening, craftPhase === 'HEATING' && styles.furnaceOpeningActive]} />
      </View>
      {/* Anvil silhouette */}
      <View style={styles.anvilBase}>
        <View style={styles.anvilTop} />
        <View style={styles.anvilHorn} />
      </View>
      {/* Metal piece on anvil */}
      {(craftPhase === 'HAMMERING' || craftPhase === 'COOLING') && (
        <View style={[styles.metalPiece, craftPhase === 'HAMMERING' && styles.metalGlow]} />
      )}
      {/* Floor */}
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

export interface ForgeScene3DRef {
  triggerHammerStrike: () => void;
}

interface Props {
  craftPhase: CraftPhase;
  upgradeLevel?: number;
}

const ForgeScene3D = forwardRef<ForgeScene3DRef, Props>(({ craftPhase, upgradeLevel = 0 }, ref) => {
  const [webglOk] = useState(() => checkWebGL());
  const craftPhaseRef = useRef<CraftPhase>(craftPhase);
  const upgradeLevelRef = useRef(upgradeLevel);
  const cleanupRef = useRef<(() => void) | null>(null);
  const triggerStrikeRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    craftPhaseRef.current = craftPhase;
  }, [craftPhase]);

  useEffect(() => {
    upgradeLevelRef.current = upgradeLevel;
  }, [upgradeLevel]);

  useEffect(() => {
    return () => {
      cleanupRef.current?.();
    };
  }, []);

  useImperativeHandle(ref, () => ({
    triggerHammerStrike: () => {
      triggerStrikeRef.current?.();
    },
  }));

  const onContextCreate = useCallback((gl: ExpoWebGLRenderingContext) => {
    const W = gl.drawingBufferWidth;
    const H = gl.drawingBufferHeight;

    // Patch for Three.js canvas compatibility on native
    if (!(gl as any).canvas) {
      (gl as any).canvas = {
        width: W,
        height: H,
        style: {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
        clientWidth: W,
        clientHeight: H,
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
      // Fallback: try without canvas hint
      renderer = new THREE.WebGLRenderer({
        context: gl as unknown as WebGL2RenderingContext,
        antialias: false,
      });
    }
    renderer.setPixelRatio(1);
    renderer.setSize(W, H);
    renderer.setClearColor(0x0A0810);

    // ─── Scene ───────────────────────────────────────────────────────────
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0A0810);
    scene.fog = new THREE.Fog(0x0A0810, 10, 22);

    // ─── Camera ──────────────────────────────────────────────────────────
    const camera = new THREE.PerspectiveCamera(44, W / H, 0.1, 50);
    camera.position.set(0, 3.8, 6.5);
    camera.lookAt(0, 1.0, 0);

    // ─── Lights ──────────────────────────────────────────────────────────
    scene.add(new THREE.AmbientLight(0x1A0E18, 0.35));

    const sunLight = new THREE.DirectionalLight(0xF2E4C4, 0.7);
    sunLight.position.set(3, 9, 5);
    scene.add(sunLight);

    const fireLight = new THREE.PointLight(0xFF5500, 2.8, 7);
    fireLight.position.set(-2.2, 1.8, 0.6);
    scene.add(fireLight);

    const fillLight = new THREE.PointLight(0x224488, 0.4, 10);
    fillLight.position.set(3, 2, -3);
    scene.add(fillLight);

    // ─── Materials ───────────────────────────────────────────────────────
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x1A0E06, roughness: 0.97 });
    const anvilMat = new THREE.MeshStandardMaterial({ color: 0x2A2A2A, roughness: 0.22, metalness: 0.95 });
    const anvilTopMat = new THREE.MeshStandardMaterial({ color: 0x3E3E3E, roughness: 0.12, metalness: 0.98 });
    const furnaceMat = new THREE.MeshStandardMaterial({ color: 0x3A1A08, roughness: 0.92 });
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x5C3A1E, roughness: 0.82 });
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x6B3A22, roughness: 0.72 });
    const skinMat = new THREE.MeshStandardMaterial({ color: 0xD4A57A, roughness: 0.62 });
    const hammerHeadMat = new THREE.MeshStandardMaterial({ color: 0x383838, roughness: 0.18, metalness: 0.97 });

    // ─── Floor ───────────────────────────────────────────────────────────
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), floorMat);
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);

    // ─── Anvil ───────────────────────────────────────────────────────────
    const anvilGroup = new THREE.Group();
    const aBase = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.22, 0.5), anvilMat);
    aBase.position.y = 0.11;
    const aWaist = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.26, 0.38), anvilMat);
    aWaist.position.y = 0.35;
    const aTop = new THREE.Mesh(new THREE.BoxGeometry(1.08, 0.17, 0.44), anvilTopMat);
    aTop.position.y = 0.575;
    const aHorn = new THREE.Mesh(new THREE.ConeGeometry(0.095, 0.52, 8), anvilTopMat);
    aHorn.rotation.z = -Math.PI / 2;
    aHorn.position.set(0.8, 0.575, 0);
    anvilGroup.add(aBase, aWaist, aTop, aHorn);
    anvilGroup.position.set(0.55, 0, 0.3);
    anvilGroup.rotation.y = -0.18;
    scene.add(anvilGroup);

    // ─── Furnace ─────────────────────────────────────────────────────────
    const furnaceGroup = new THREE.Group();
    const fBase = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.28, 1.1), furnaceMat);
    fBase.position.y = 0.14;
    const fBody = new THREE.Mesh(new THREE.BoxGeometry(1.28, 1.55, 0.94), furnaceMat);
    fBody.position.y = 0.895;
    const fArchMat = new THREE.MeshStandardMaterial({ color: 0x2A1204, roughness: 0.95 });
    const fArch = new THREE.Mesh(
      new THREE.CylinderGeometry(0.6, 0.6, 0.9, 12, 1, false, 0, Math.PI),
      fArchMat,
    );
    fArch.rotation.z = Math.PI / 2;
    fArch.position.set(0, 1.63, 0);
    const glowMat = new THREE.MeshStandardMaterial({
      color: 0xFF4400,
      emissive: new THREE.Color(0xFF4400),
      emissiveIntensity: 2.2,
    });
    const fOpening = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.52, 0.08), glowMat);
    fOpening.position.set(0, 0.9, 0.49);
    const chimneyMat = new THREE.MeshStandardMaterial({ color: 0x251005, roughness: 0.9 });
    const fChimney = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.17, 1.3, 8), chimneyMat);
    fChimney.position.set(-0.2, 2.88, 0);
    furnaceGroup.add(fBase, fBody, fArch, fOpening, fChimney);
    furnaceGroup.position.set(-2.25, 0, 0.2);
    scene.add(furnaceGroup);

    // ─── Workbench ───────────────────────────────────────────────────────
    const benchTop = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.1, 0.78), woodMat);
    benchTop.position.set(-0.1, 0.95, 2.0);
    scene.add(benchTop);
    const legMat = new THREE.MeshStandardMaterial({ color: 0x4A2E14, roughness: 0.85 });
    for (const [dx, dz] of [[-0.72, 0.28], [0.72, 0.28], [-0.72, -0.28], [0.72, -0.28]]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.95, 6), legMat);
      leg.position.set(-0.1 + dx, 0.475, 2.0 + dz);
      scene.add(leg);
    }

    // ─── Blacksmith ──────────────────────────────────────────────────────
    const smithGroup = new THREE.Group();
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.17, 0.62, 8), bodyMat);
    torso.position.y = 1.0;
    const waist = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.19, 0.18, 8), bodyMat);
    waist.position.y = 0.65;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.195, 10, 10), skinMat);
    head.position.y = 1.56;
    const hairMat = new THREE.MeshStandardMaterial({ color: 0x221508, roughness: 0.85 });
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 8), hairMat);
    hair.position.set(0, 1.7, -0.05);
    const armL = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.055, 0.52, 8), bodyMat);
    armL.position.set(-0.28, 0.96, 0.08);
    armL.rotation.z = 0.28;

    // Right arm group (for hammer swing animation)
    const armRGroup = new THREE.Group();
    armRGroup.position.set(0.26, 1.18, 0.1);
    const armR = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.055, 0.52, 8), bodyMat);
    armR.position.y = -0.2;
    armR.rotation.z = -0.35;
    const handleMat = new THREE.MeshStandardMaterial({ color: 0x5C3A1E, roughness: 0.82 });
    const hHandle = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.58, 8), handleMat);
    hHandle.position.set(0.12, -0.52, 0);
    hHandle.rotation.z = 0.35;
    const hHead = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.26, 0.12), hammerHeadMat);
    hHead.position.set(0.24, -0.76, 0);
    armRGroup.add(armR, hHandle, hHead);

    const legL = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.09, 0.52, 8), bodyMat);
    legL.position.set(-0.12, 0.27, 0);
    const legR = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.09, 0.52, 8), bodyMat);
    legR.position.set(0.12, 0.27, 0);

    smithGroup.add(torso, waist, head, hair, armL, armRGroup, legL, legR);
    smithGroup.position.set(-0.2, 0, 0.52);
    smithGroup.rotation.y = 0.3;
    scene.add(smithGroup);

    // ─── Metal piece ─────────────────────────────────────────────────────
    const metalMat = new THREE.MeshStandardMaterial({
      color: 0x666666,
      roughness: 0.28,
      metalness: 0.92,
      emissive: new THREE.Color(0x000000),
      emissiveIntensity: 0,
    });
    const metalPiece = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.07, 0.13), metalMat);
    metalPiece.position.set(0.55, 0.68, 0.3);
    metalPiece.visible = false;
    scene.add(metalPiece);

    // ─── Spark particles ─────────────────────────────────────────────────
    const SPARK_COUNT = 24;
    const sparkGeo = new THREE.BufferGeometry();
    const sparkPosArr = new Float32Array(SPARK_COUNT * 3);
    sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPosArr, 3));
    const sparkVel: THREE.Vector3[] = Array.from({ length: SPARK_COUNT }, () =>
      new THREE.Vector3(),
    );
    const sparkLife = new Float32Array(SPARK_COUNT).fill(0);
    const sparkMat = new THREE.PointsMaterial({
      color: 0xFF8800,
      size: 0.055,
      sizeAttenuation: true,
    });
    const sparks = new THREE.Points(sparkGeo, sparkMat);
    sparks.visible = false;
    scene.add(sparks);

    let sparkActive = false;
    let sparkTimer = 0;

    const resetSpark = (i: number) => {
      sparkPosArr[i * 3] = 0.55 + (Math.random() - 0.5) * 0.1;
      sparkPosArr[i * 3 + 1] = 0.73;
      sparkPosArr[i * 3 + 2] = 0.3 + (Math.random() - 0.5) * 0.05;
      sparkVel[i].set(
        (Math.random() - 0.5) * 0.18,
        Math.random() * 0.18 + 0.04,
        (Math.random() - 0.5) * 0.18,
      );
      sparkLife[i] = 0.5 + Math.random() * 0.5;
    };

    triggerStrikeRef.current = () => {
      sparkActive = true;
      sparkTimer = 0;
      for (let i = 0; i < SPARK_COUNT; i++) resetSpark(i);
    };

    // ─── Animation loop ──────────────────────────────────────────────────
    let t = 0;
    let armSwingDir = 1;
    let armSwing = 0;
    let lastPhase: CraftPhase = 'IDLE';
    let rafId: number;

    const animate = () => {
      rafId = requestAnimationFrame(animate);
      t += 0.016;
      const phase = craftPhaseRef.current;

      // Fire flicker — scales with forge upgrade level
      const upgradeBoost = upgradeLevelRef.current * 0.12;
      fireLight.intensity = (2.5 + upgradeBoost) + Math.sin(t * 7.1) * 0.5 + Math.sin(t * 13.3) * 0.28;

      // Camera breathing
      camera.position.y = 3.8 + Math.sin(t * 0.38) * 0.07;
      camera.position.x = Math.sin(t * 0.09) * 0.12;
      camera.lookAt(0, 1.0, 0);

      // Phase transitions
      if (phase !== lastPhase) {
        if (phase === 'HEATING') {
          metalPiece.visible = true;
          metalPiece.position.set(0.55, 0.68, 0.3);
          metalMat.emissiveIntensity = 0;
        }
        if (phase === 'IDLE' || phase === 'RESULT') {
          metalPiece.visible = false;
          metalMat.emissiveIntensity = 0;
        }
        lastPhase = phase;
      }

      if (phase === 'HEATING') {
        // Metal moves toward furnace
        metalPiece.position.x = THREE.MathUtils.lerp(metalPiece.position.x, -1.75, 0.018);
        metalPiece.position.z = THREE.MathUtils.lerp(metalPiece.position.z, 0.65, 0.018);
        // Glow ramps up
        metalMat.emissiveIntensity = Math.min(2.5, metalMat.emissiveIntensity + 0.015);
        metalMat.emissive.setHex(0xFF5500);
        (fOpening.material as THREE.MeshStandardMaterial).emissiveIntensity =
          2.2 + Math.sin(t * 5) * 0.9;
        fireLight.intensity = 4.5 + Math.sin(t * 6) * 1.0;
      }

      if (phase === 'HAMMERING') {
        // Metal on anvil, glowing orange
        metalPiece.position.x = THREE.MathUtils.lerp(metalPiece.position.x, 0.55, 0.06);
        metalPiece.position.z = THREE.MathUtils.lerp(metalPiece.position.z, 0.3, 0.06);
        metalPiece.position.y = 0.68;
        metalMat.emissiveIntensity = 1.6 + Math.sin(t * 4) * 0.2;
        metalMat.emissive.setHex(0xFF6600);

        // Hammer idle swing
        armSwing += 0.04 * armSwingDir;
        if (armSwing > 0.35) armSwingDir = -1;
        if (armSwing < -0.15) armSwingDir = 1;
        armRGroup.rotation.x = armSwing;
      }

      if (phase === 'COOLING') {
        metalPiece.visible = true;
        metalPiece.position.x = THREE.MathUtils.lerp(metalPiece.position.x, 0.55, 0.04);
        metalMat.emissiveIntensity = Math.max(0, metalMat.emissiveIntensity - 0.015);
        metalMat.color.lerp(new THREE.Color(0x666666), 0.02);
      }

      // Spark particles
      if (sparkActive) {
        sparkTimer += 0.016;
        sparks.visible = true;
        for (let i = 0; i < SPARK_COUNT; i++) {
          sparkLife[i] -= 0.022;
          if (sparkLife[i] <= 0) {
            resetSpark(i);
          }
          sparkPosArr[i * 3] += sparkVel[i].x;
          sparkPosArr[i * 3 + 1] += sparkVel[i].y;
          sparkPosArr[i * 3 + 2] += sparkVel[i].z;
          sparkVel[i].y -= 0.005;
        }
        sparkGeo.attributes.position.needsUpdate = true;
        if (sparkTimer > 1.2) {
          sparkActive = false;
          sparks.visible = false;
        }
      }

      renderer.render(scene, camera);
      gl.endFrameEXP();
    };
    animate();

    cleanupRef.current = () => {
      cancelAnimationFrame(rafId);
      renderer.dispose();
      sparkGeo.dispose();
    };
  }, []);

  if (!webglOk) {
    return <ForgeFallback craftPhase={craftPhase} />;
  }

  return <GLView style={styles.gl} onContextCreate={onContextCreate} />;
});

ForgeScene3D.displayName = 'ForgeScene3D';
export default ForgeScene3D;

const styles = StyleSheet.create({
  gl: { flex: 1 },

  // 2D fallback styles
  fallback: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  furnaceGlow: {
    position: 'absolute',
    left: '8%',
    top: '20%',
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: '#FF440022',
  },
  furnaceBody: {
    position: 'absolute',
    left: '10%',
    top: '28%',
    width: 70,
    height: 90,
    backgroundColor: '#2A1204',
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  furnaceOpening: {
    width: 32,
    height: 30,
    backgroundColor: '#221002',
    borderRadius: 3,
  },
  furnaceOpeningActive: {
    backgroundColor: '#FF4400',
  },
  anvilBase: {
    position: 'absolute',
    bottom: '32%',
    left: '42%',
    width: 70,
    height: 38,
    backgroundColor: '#2A2A2A',
    borderRadius: 4,
  },
  anvilTop: {
    position: 'absolute',
    top: -12,
    left: -8,
    width: 86,
    height: 14,
    backgroundColor: '#3E3E3E',
    borderRadius: 2,
  },
  anvilHorn: {
    position: 'absolute',
    top: -8,
    right: -22,
    width: 26,
    height: 10,
    backgroundColor: '#3E3E3E',
    borderTopRightRadius: 8,
    borderBottomRightRadius: 8,
  },
  metalPiece: {
    position: 'absolute',
    bottom: '40%',
    left: '48%',
    width: 28,
    height: 8,
    backgroundColor: '#666',
    borderRadius: 2,
  },
  metalGlow: { backgroundColor: '#FF8833' },
  floorLine: {
    position: 'absolute',
    bottom: '22%',
    left: 0,
    right: 0,
    height: 2,
    opacity: 0.4,
  },
  fallbackLabel: {
    position: 'absolute',
    bottom: '10%',
    fontSize: 16,
    fontWeight: '800',
    color: '#D4851A',
    letterSpacing: 3,
  },
});
