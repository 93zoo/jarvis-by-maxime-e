/**
 * À propos — l'histoire de Braise Noire Studios.
 */
import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { STUDIO } from '@/constants/studio';

export default function AProposScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
      <View style={styles.header}>
        <Text style={styles.title}>À PROPOS</Text>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Feather name="x" size={22} color="#6B6152" />
        </TouchableOpacity>
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 32, gap: 18 }}>
        <View style={styles.logoBlock}>
          <View style={styles.logoGlow} />
          <Feather name="tool" size={44} color={STUDIO.gold} />
          <Text style={styles.studioName}>BRAISE NOIRE</Text>
          <Text style={styles.studioSub}>STUDIOS</Text>
          <Text style={styles.tagline}>{STUDIO.tagline}</Text>
        </View>

        <Text style={styles.paragraph}>
          Braise Noire est un atelier de jeux indépendant né d'une conviction simple :
          les meilleurs jeux se forgent comme les meilleures lames — à la main, avec
          patience, et au plus près du feu.
        </Text>
        <Text style={styles.paragraph}>
          Tout a commencé avec une enclume, un marteau et une question : et si chaque
          objet que vous fabriquiez dans un jeu était réellement unique ? De cette
          étincelle est né <Text style={styles.em}>Forge & Kingdoms</Text>, notre
          première licence, où chaque épée porte l'empreinte de son forgeron.
        </Text>
        <Text style={styles.paragraph}>
          Nous croyons aux jeux généreux : pas de murs de paiement, pas de publicités
          forcées, pas de progression bridée. Juste le plaisir du métal qui chante,
          des braises qui crépitent, et d'un royaume qui grandit avec vous.
        </Text>

        <View style={styles.divider} />

        <View style={styles.valueRow}>
          <Feather name="heart" size={14} color={STUDIO.gold} />
          <Text style={styles.valueText}>Fait avec passion, sans pay-to-win</Text>
        </View>
        <View style={styles.valueRow}>
          <Feather name="shield" size={14} color={STUDIO.gold} />
          <Text style={styles.valueText}>Vos sauvegardes vous appartiennent</Text>
        </View>
        <View style={styles.valueRow}>
          <Feather name="users" size={14} color={STUDIO.gold} />
          <Text style={styles.valueText}>Construit avec sa communauté de forgerons</Text>
        </View>

        <Text style={styles.version}>Forge & Kingdoms · v1.0 · © 2026 Braise Noire Studios</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: STUDIO.coal, paddingHorizontal: 20 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 },
  title: { color: STUDIO.parchment, fontSize: 16, fontWeight: '800', letterSpacing: 3 },
  logoBlock: { alignItems: 'center', paddingVertical: 24, gap: 4 },
  logoGlow: { position: 'absolute', top: 8, width: 110, height: 110, borderRadius: 55, backgroundColor: STUDIO.gold, opacity: 0.12 },
  studioName: { color: STUDIO.parchment, fontSize: 22, fontWeight: '900', letterSpacing: 5, marginTop: 10 },
  studioSub: { color: STUDIO.gold, fontSize: 10, fontWeight: '800', letterSpacing: 7 },
  tagline: { color: '#6B6152', fontSize: 11, fontStyle: 'italic', marginTop: 8 },
  paragraph: { color: '#C8BCA6', fontSize: 14, lineHeight: 22 },
  em: { color: STUDIO.gold, fontWeight: '700' },
  divider: { height: 1, backgroundColor: '#2A2218', marginVertical: 6 },
  valueRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  valueText: { color: '#A99C86', fontSize: 13 },
  version: { color: '#524A3C', fontSize: 11, textAlign: 'center', marginTop: 24 },
});
