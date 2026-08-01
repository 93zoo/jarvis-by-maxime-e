/**
 * NeonIconButton — bouton d'icône avec effet néon animé (halo pulsant coloré).
 * Utilisé pour les icônes importantes de l'en-tête (classement, boutique, …).
 */
import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Platform, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

interface Props {
  icon: keyof typeof Feather.glyphMap;
  color: string; // couleur néon (ex. '#00E5FF')
  onPress: () => void;
  size?: number;
  accessibilityLabel?: string;
}

export default function NeonIconButton({ icon, color, onPress, size = 17, accessibilityLabel }: Props) {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 1000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  const haloOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.25, 0.85] });
  const haloScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.35] });
  const iconScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] });

  const handlePress = () => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onPress();
  };

  return (
    <TouchableOpacity onPress={handlePress} activeOpacity={0.75} accessibilityLabel={accessibilityLabel} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
      <View style={styles.wrap}>
        {/* Halo néon extérieur */}
        <Animated.View
          pointerEvents="none"
          style={[
            styles.halo,
            {
              borderColor: color,
              opacity: haloOpacity,
              transform: [{ scale: haloScale }],
              shadowColor: color,
            },
          ]}
        />
        {/* Pastille avec lueur */}
        <Animated.View
          style={[
            styles.core,
            {
              borderColor: color,
              shadowColor: color,
              transform: [{ scale: iconScale }],
            },
          ]}
        >
          <Feather name={icon} size={size} color={color} />
        </Animated.View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrap: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  halo: {
    position: 'absolute',
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1.5,
    shadowOpacity: 0.9,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
    elevation: 6,
  },
  core: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
    shadowOpacity: 0.7,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
    elevation: 5,
  },
});
