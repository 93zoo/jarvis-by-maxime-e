/**
 * CraftingEnigmaModal — full-screen overlay challenge shown after a Rare+ craft.
 * Randomly picks RuneSequence / PrecisionGauge / PuzzleSlide.
 * On success the item quality is bumped one tier; on fail it's forged as-is.
 */
import React, { useEffect, useState } from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';
import Feather from '@/components/Feather';
import type { RecipeData } from '@/types/game';
import RuneSequence from './RuneSequence';
import PrecisionGauge from './PrecisionGauge';
import PuzzleSlide from './PuzzleSlide';

type EnigmaType = 'rune' | 'gauge' | 'puzzle';
type ModalPhase = 'countdown' | 'playing' | 'result';

const DIFF_LABELS: Record<1 | 2 | 3, string> = { 1: 'RARE', 2: 'ÉPIQUE', 3: 'LÉGENDAIRE' };
const DIFF_COLORS: Record<1 | 2 | 3, string> = {
  1: '#0A7FC7',
  2: '#9B30D0',
  3: '#FF7A1A',
};

function getDifficulty(levelRequired: number): 1 | 2 | 3 {
  if (levelRequired >= 15) return 3;
  if (levelRequired >= 10) return 2;
  return 1;
}

interface Props {
  recipe: RecipeData;
  enigmaZoneBonus: number;
  onResult: (success: boolean) => void;
}

export default function CraftingEnigmaModal({ recipe, enigmaZoneBonus, onResult }: Props) {
  const difficulty = getDifficulty(recipe.levelRequired);

  const [enigmaType] = useState<EnigmaType>(() => {
    const types: EnigmaType[] = ['rune', 'gauge', 'puzzle'];
    return types[Math.floor(Math.random() * types.length)];
  });
  const [phase, setPhase] = useState<ModalPhase>('countdown');
  const [countdown, setCountdown] = useState(3);
  const [result, setResult] = useState<'success' | 'fail' | null>(null);

  // 3 → 2 → 1 → playing
  useEffect(() => {
    if (phase !== 'countdown') return;
    let n = 3;
    setCountdown(n);
    const id = setInterval(() => {
      n--;
      if (n <= 0) {
        clearInterval(id);
        setPhase('playing');
      } else {
        setCountdown(n);
      }
    }, 800);
    return () => clearInterval(id);
  }, [phase]);

  const handleEnigmaResult = (success: boolean) => {
    setResult(success ? 'success' : 'fail');
    setPhase('result');
    setTimeout(() => onResult(success), 1800);
  };

  const enigmaTypeLabel: Record<EnigmaType, string> = {
    rune: 'Séquence de Runes',
    gauge: 'Jauge de Précision',
    puzzle: 'Puzzle Coulissant',
  };

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          {/* ── Header ── */}
          <Text style={styles.challengeLabel}>DÉFI DE FORGE</Text>
          <Text style={styles.recipeName}>{recipe.name}</Text>
          <View style={[styles.diffBadge, { backgroundColor: DIFF_COLORS[difficulty] }]}>
            <Text style={styles.diffText}>{DIFF_LABELS[difficulty]}</Text>
          </View>
          {phase === 'playing' && (
            <Text style={styles.enigmaTypeLbl}>{enigmaTypeLabel[enigmaType]}</Text>
          )}

          <View style={styles.divider} />

          {/* ── Countdown ── */}
          {phase === 'countdown' && (
            <View style={styles.centreBox}>
              <Text style={styles.countdownNum}>{countdown}</Text>
              <Text style={styles.countdownSub}>Préparez-vous…</Text>
            </View>
          )}

          {/* ── Enigma components ── */}
          {phase === 'playing' && enigmaType === 'rune' && (
            <RuneSequence
              difficulty={difficulty}
              onSuccess={() => handleEnigmaResult(true)}
              onFail={() => handleEnigmaResult(false)}
            />
          )}
          {phase === 'playing' && enigmaType === 'gauge' && (
            <PrecisionGauge
              difficulty={difficulty}
              enigmaZoneBonus={enigmaZoneBonus}
              onSuccess={() => handleEnigmaResult(true)}
              onFail={() => handleEnigmaResult(false)}
            />
          )}
          {phase === 'playing' && enigmaType === 'puzzle' && (
            <PuzzleSlide
              difficulty={difficulty}
              onSuccess={() => handleEnigmaResult(true)}
              onFail={() => handleEnigmaResult(false)}
            />
          )}

          {/* ── Results ── */}
          {phase === 'result' && result === 'success' && (
            <View style={styles.centreBox}>
              <Feather name="star" size={52} color="#E8B84B" />
              <Text style={[styles.resultTitle, { color: '#E8B84B' }]}>DÉFI RÉUSSI !</Text>
              <Text style={styles.resultDesc}>Qualité de l'objet améliorée d'un cran</Text>
              <View style={styles.bonusBadge}>
                <Text style={styles.bonusBadgeText}>+ BONUS ÉNIGME</Text>
              </View>
            </View>
          )}
          {phase === 'result' && result === 'fail' && (
            <View style={styles.centreBox}>
              <Feather name="hexagon" size={52} color="rgba(255,255,255,0.28)" />
              <Text style={[styles.resultTitle, { color: 'rgba(255,255,255,0.55)' }]}>DÉFI ÉCHOUÉ</Text>
              <Text style={styles.resultDesc}>Forgeage sans bonus supplémentaire</Text>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.88)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#1A1510',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#E8B84B40',
    padding: 24,
    alignItems: 'center',
    gap: 12,
    shadowColor: '#E8B84B',
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 0 },
    elevation: 20,
  },
  challengeLabel: {
    fontSize: 11, fontWeight: '900', letterSpacing: 3,
    color: '#E8B84B', textTransform: 'uppercase',
  },
  recipeName: { fontSize: 20, fontWeight: '800', color: '#F2E4C4', textAlign: 'center' },
  diffBadge: { paddingHorizontal: 14, paddingVertical: 4, borderRadius: 20 },
  diffText: { fontSize: 11, fontWeight: '900', color: '#FFFFFF', letterSpacing: 2 },
  enigmaTypeLbl: { fontSize: 12, color: 'rgba(255,255,255,0.4)', fontWeight: '600' },
  divider: { width: '100%', height: 1, backgroundColor: 'rgba(255,255,255,0.08)', marginVertical: 4 },
  centreBox: { alignItems: 'center', paddingVertical: 20, gap: 10 },
  countdownNum: {
    fontSize: 72, fontWeight: '900', color: '#E8B84B',
    fontVariant: ['tabular-nums'],
  },
  countdownSub: { fontSize: 14, color: 'rgba(255,255,255,0.4)' },
  resultStar: { fontSize: 52, color: '#E8B84B' },
  resultTitle: { fontSize: 22, fontWeight: '900', letterSpacing: 2 },
  resultDesc: { fontSize: 13, color: 'rgba(255,255,255,0.45)', textAlign: 'center' },
  bonusBadge: {
    marginTop: 4, paddingHorizontal: 18, paddingVertical: 6,
    backgroundColor: '#E8B84B1A', borderRadius: 20,
    borderWidth: 1, borderColor: '#E8B84B55',
  },
  bonusBadgeText: { fontSize: 12, fontWeight: '900', color: '#E8B84B', letterSpacing: 2 },
});
