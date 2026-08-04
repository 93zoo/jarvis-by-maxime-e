/**
 * RuneSequence — Simon Says style enigma.
 * Shows a sequence of rune symbols; player must reproduce it in order.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import Feather from '@/components/Feather';

const RUNES = [
  { id: 'activity',      icon: 'activity' as const,       color: '#FF6B35', label: 'FEU' },
  { id: 'ice',       icon: 'wind' as const,      color: '#81D4FA', label: 'GLACE' },
  { id: 'lightning', icon: 'zap' as const,   color: '#FFD54F', label: 'FOUDRE' },
  { id: 'earth',     icon: 'feather' as const,        color: '#66BB6A', label: 'TERRE' },
] as const;

type Phase = 'waiting' | 'showing' | 'input' | 'done';

interface Props {
  difficulty: 1 | 2 | 3;
  onSuccess: () => void;
  onFail: () => void;
}

export default function RuneSequence({ difficulty, onSuccess, onFail }: Props) {
  const seqLen = 3 + difficulty; // 4, 5, 6
  const inputTimeout = [12, 9, 6][difficulty - 1];

  const [sequence] = useState<number[]>(() =>
    Array.from({ length: seqLen }, () => Math.floor(Math.random() * 4))
  );
  const [phase, setPhase] = useState<Phase>('waiting');
  const [showingSeqPos, setShowingSeqPos] = useState(-1); // position in sequence being shown
  const [showingRuneIdx, setShowingRuneIdx] = useState(-1); // which button is lit (0-3)
  const [playerProgress, setPlayerProgress] = useState(0);
  const [pressedBtn, setPressedBtn] = useState<number | null>(null);
  const [wrongBtn, setWrongBtn] = useState<number | null>(null);
  const [timeLeft, setTimeLeft] = useState(inputTimeout);
  const doneRef = useRef(false);

  // Phase 1: short pause then start showing
  useEffect(() => {
    const t = setTimeout(() => setPhase('showing'), 600);
    return () => clearTimeout(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Phase 2: animate through sequence
  useEffect(() => {
    if (phase !== 'showing') return;
    let i = 0;
    const step = () => {
      if (i >= sequence.length) {
        setShowingSeqPos(-1);
        setShowingRuneIdx(-1);
        setTimeout(() => setPhase('input'), 400);
        return;
      }
      setShowingSeqPos(i);
      setShowingRuneIdx(sequence[i]);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      i++;
      setTimeout(() => {
        setShowingSeqPos(-1);
        setShowingRuneIdx(-1);
        setTimeout(step, 280);
      }, 550);
    };
    const t = setTimeout(step, 300);
    return () => clearTimeout(t);
  }, [phase, sequence]);

  // Phase 3: input countdown
  useEffect(() => {
    if (phase !== 'input') return;
    setTimeLeft(inputTimeout);
    const id = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(id);
          if (!doneRef.current) {
            doneRef.current = true;
            setPhase('done');
            setTimeout(onFail, 300);
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleTap = useCallback((runeIdx: number) => {
    if (phase !== 'input' || doneRef.current) return;
    setPressedBtn(runeIdx);
    setTimeout(() => setPressedBtn(null), 180);

    if (runeIdx !== sequence[playerProgress]) {
      doneRef.current = true;
      setWrongBtn(runeIdx);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setTimeout(() => { setPhase('done'); onFail(); }, 800);
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const next = playerProgress + 1;
    if (next >= sequence.length) {
      doneRef.current = true;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setTimeout(() => { setPhase('done'); onSuccess(); }, 600);
    } else {
      setPlayerProgress(next);
    }
  }, [phase, playerProgress, sequence, onSuccess, onFail]);

  return (
    <View style={styles.container}>
      <Text style={styles.instruction}>
        {phase === 'waiting' && 'Mémorisez la séquence de runes…'}
        {phase === 'showing' && 'Regardez attentivement…'}
        {phase === 'input' && `Reproduisez ! (${timeLeft}s)`}
        {phase === 'done' && ''}
      </Text>

      {/* Sequence slot indicators */}
      <View style={styles.seqRow}>
        {sequence.map((runeIdx, pos) => {
          const rune = RUNES[runeIdx];
          const isShowing = showingSeqPos === pos;
          const isDone = pos < playerProgress;
          return (
            <View
              key={pos}
              style={[
                styles.seqSlot,
                {
                  backgroundColor: isShowing
                    ? rune.color + '33'
                    : isDone ? '#1A2E1A' : 'rgba(255,255,255,0.05)',
                  borderColor: isShowing
                    ? rune.color
                    : isDone ? '#4CAF5080' : 'rgba(255,255,255,0.12)',
                },
              ]}
            >
              <Feather
                name={isShowing ? rune.icon : (isDone ? 'check' : 'help-circle')}
                size={16}
                color={isShowing ? rune.color : isDone ? '#4CAF50' : 'rgba(255,255,255,0.2)'}
              />
            </View>
          );
        })}
      </View>

      {/* Rune buttons */}
      <View style={styles.btnGrid}>
        {RUNES.map((rune, idx) => {
          const isLit = showingRuneIdx === idx;
          const isPressed = pressedBtn === idx;
          const isWrong = wrongBtn === idx;
          return (
            <TouchableOpacity
              key={rune.id}
              style={[
                styles.runeBtn,
                {
                  backgroundColor: isLit || isPressed ? rune.color + '44'
                    : isWrong ? '#FF000022' : rune.color + '14',
                  borderColor: isLit || isPressed ? rune.color
                    : isWrong ? '#FF0000' : rune.color + '50',
                  borderWidth: isLit || isPressed || isWrong ? 2 : 1,
                  transform: [{ scale: isPressed ? 0.91 : 1 }],
                },
              ]}
              onPress={() => handleTap(idx)}
              disabled={phase !== 'input' || doneRef.current}
              activeOpacity={0.75}
            >
              <Feather name={rune.icon} size={32} color={rune.color} />
              <Text style={[styles.runeLbl, { color: rune.color }]}>{rune.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', gap: 18, width: '100%' },
  instruction: {
    fontSize: 14, fontWeight: '700',
    color: '#F2E4C4', textAlign: 'center', minHeight: 20,
  },
  seqRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', justifyContent: 'center' },
  seqSlot: {
    width: 34, height: 34, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1,
  },
  btnGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, justifyContent: 'center' },
  runeBtn: { width: 90, height: 90, borderRadius: 16, alignItems: 'center', justifyContent: 'center', gap: 6 },
  runeLbl: { fontSize: 10, fontWeight: '800', letterSpacing: 1 },
});
