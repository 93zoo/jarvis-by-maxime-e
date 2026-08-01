/**
 * PuzzleSlide — 2×2 sliding puzzle.
 * Goal: arrange tiles [1][2] / [3][ ] by tapping adjacent tiles to slide them.
 */
import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as Haptics from 'expo-haptics';

// Adjacency map: which indices are neighbours of index i in a 2×2 grid
const ADJACENT: ReadonlyArray<ReadonlyArray<number>> = [
  [1, 2],   // 0 → right(1), below(2)
  [0, 3],   // 1 → left(0),  below(3)
  [0, 3],   // 2 → above(0), right(3)
  [1, 2],   // 3 → above(1), left(2)
];

const SOLVED: ReadonlyArray<number> = [1, 2, 3, 0]; // 0 = empty tile

function shuffle(state: number[], moves: number): number[] {
  const s = [...state];
  let lastEmptyIdx = -1;
  for (let i = 0; i < moves; i++) {
    const emptyIdx = s.indexOf(0);
    // Avoid immediately reversing the last move (don't go back)
    const candidates = ADJACENT[emptyIdx].filter((a) => a !== lastEmptyIdx);
    const tileIdx = candidates[Math.floor(Math.random() * candidates.length)];
    [s[emptyIdx], s[tileIdx]] = [s[tileIdx], s[emptyIdx]];
    lastEmptyIdx = emptyIdx;
  }
  return s;
}

function isSolved(state: number[]): boolean {
  return state.every((v, i) => v === SOLVED[i]);
}

interface Props {
  difficulty: 1 | 2 | 3;
  onSuccess: () => void;
  onFail: () => void;
}

const TILE_SIZE = 90;
const TILE_GAP = 6;

const TILE_COLORS = ['#2E2A22', '#E8B84B', '#C47B2B', '#8B5A1A'];
const TILE_TEXT_COLORS = ['transparent', '#0D0A07', '#0D0A07', '#0D0A07'];

export default function PuzzleSlide({ difficulty, onSuccess, onFail }: Props) {
  const timeLimit = [30, 20, 12][difficulty - 1];
  const shuffleMoves = [12, 18, 24][difficulty - 1];

  const [tiles, setTiles] = useState<number[]>(() =>
    shuffle([...SOLVED], shuffleMoves)
  );
  const [timeLeft, setTimeLeft] = useState(timeLimit);
  const [complete, setComplete] = useState(false);
  const doneRef = useRef(false);

  // Countdown timer
  useEffect(() => {
    const id = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(id);
          if (!doneRef.current) {
            doneRef.current = true;
            setComplete(true);
            setTimeout(onFail, 600);
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleTap = (idx: number) => {
    if (doneRef.current) return;
    const emptyIdx = tiles.indexOf(0);
    if (!ADJACENT[emptyIdx].includes(idx)) return; // not adjacent to empty

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const next = [...tiles];
    [next[emptyIdx], next[idx]] = [next[idx], next[emptyIdx]];
    setTiles(next);

    if (isSolved(next)) {
      doneRef.current = true;
      setComplete(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setTimeout(onSuccess, 700);
    }
  };

  const boardSize = TILE_SIZE * 2 + TILE_GAP;
  const timerColor = timeLeft <= 5 ? '#FF5252' : timeLeft <= 10 ? '#FF7A1A' : '#E8B84B';

  return (
    <View style={styles.container}>
      <Text style={styles.instruction}>Reconstituez le puzzle !</Text>

      {/* Timer */}
      <Text style={[styles.timer, { color: timerColor }]}>{timeLeft}s</Text>

      {/* 2×2 board */}
      <View
        style={[
          styles.board,
          { width: boardSize, height: boardSize },
        ]}
      >
        {tiles.map((val, idx) => {
          const row = Math.floor(idx / 2);
          const col = idx % 2;
          const isEmpty = val === 0;
          const emptyIdx = tiles.indexOf(0);
          const isAdjacent = ADJACENT[emptyIdx].includes(idx);

          return (
            <TouchableOpacity
              key={idx}
              onPress={() => handleTap(idx)}
              disabled={isEmpty || !isAdjacent || doneRef.current}
              activeOpacity={0.7}
              style={[
                styles.tile,
                {
                  left: col * (TILE_SIZE + TILE_GAP),
                  top: row * (TILE_SIZE + TILE_GAP),
                  width: TILE_SIZE,
                  height: TILE_SIZE,
                  backgroundColor: isEmpty ? 'transparent' : TILE_COLORS[val],
                  borderWidth: isEmpty ? 1 : isAdjacent && !doneRef.current ? 2 : 1,
                  borderColor: isEmpty
                    ? 'rgba(255,255,255,0.08)'
                    : isAdjacent && !doneRef.current
                    ? '#E8B84B'
                    : '#3A3228',
                },
              ]}
            >
              {!isEmpty && (
                <Text style={[styles.tileNum, { color: TILE_TEXT_COLORS[val] }]}>
                  {val}
                </Text>
              )}
              {isEmpty && (
                <View style={styles.emptyDot} />
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={styles.hint}>Glissez les tuiles adjacentes à la case vide</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', gap: 12, width: '100%' },
  instruction: { fontSize: 14, fontWeight: '700', color: '#F2E4C4', textAlign: 'center' },
  timer: { fontSize: 28, fontWeight: '900', fontVariant: ['tabular-nums'] },
  board: { position: 'relative' },
  tile: {
    position: 'absolute',
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileNum: { fontSize: 36, fontWeight: '900' },
  emptyDot: {
    width: 10, height: 10, borderRadius: 5,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  hint: { fontSize: 11, color: 'rgba(255,255,255,0.35)', textAlign: 'center' },
});
