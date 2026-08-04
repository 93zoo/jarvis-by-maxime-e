/**
 * Boutique — in-app purchase shop: gold packs (consumables) + Forge Premium subscription.
 * Prices always come from RevenueCat offerings, never hardcoded.
 */
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import type { PurchasesPackage } from 'react-native-purchases';
import { useSubscription, GOLD_PRODUCTS, RESOURCE_PRODUCTS } from '@/lib/revenuecat';
import { useRewardedAds, ADS_UNLOCK_LEVEL } from '@/lib/rewardedAds';
import { useGame } from '@/context/GameContext';
import { WORKER_DEFINITIONS } from '@/data/workers';
import { getLeaderboardApiBase } from '@/lib/leaderboard';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useColors } from '@/hooks/useColors';
let _resourceNameMap: Record<string, string> | undefined;
function getResourceNameMap(): Record<string, string> {
  if (!_resourceNameMap) {
    const data = require('@/data/resources.json') as { id: string; name: string }[];
    _resourceNameMap = Object.fromEntries(data.map((r) => [r.id, r.name]));
  }
  return _resourceNameMap;
}

const DAILY_CHEST_KEY = '@fk_daily_ad_chest_v1';
const AD_GOLD_KEY = '@fk_ad_gold_v1';
const AD_GOLD_MAX_PER_DAY = 3;
const CHEST_MATERIALS = ['silver', 'gold_ore', 'crystal', 'ruby', 'sapphire', 'emerald'];

function adGoldAmount(level: number): number {
  return 75 + level * 15;
}

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

/** URL de la politique de confidentialité, servie par l'API server (…/api/privacy). */
function getPrivacyPolicyUrl(): string {
  const base = getLeaderboardApiBase(); // ex. https://<domaine>/api-server/api
  if (!base) return '';
  return `${base}/privacy`;
}

function openPrivacyPolicy(): void {
  const url = getPrivacyPolicyUrl();
  if (url) Linking.openURL(url).catch(() => {});
}

/** URL des conditions d'utilisation, servie par l'API server (…/api/terms). */
function getTermsUrl(): string {
  const base = getLeaderboardApiBase();
  if (!base) return '';
  return `${base}/terms`;
}

function openTermsOfUse(): void {
  const url = getTermsUrl();
  if (url) Linking.openURL(url).catch(() => {});
}

function baseProductId(identifier: string): string {
  // Play Store subscription ids look like "forge_premium:monthly"
  return identifier.split(':')[0];
}

export default function BoutiqueScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { available, offerings, isSubscribed, isLoading, purchase, restore, isPurchasing, isRestoring } =
    useSubscription();
  const game = useGame();
  const { adsUnlocked, showRewardedAd } = useRewardedAds();

  const [confirmPkg, setConfirmPkg] = useState<PurchasesPackage | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [chestClaimedToday, setChestClaimedToday] = useState<boolean | null>(null);
  const [chestBusy, setChestBusy] = useState(false);
  const [adGoldCount, setAdGoldCount] = useState<number | null>(null);
  const [adGoldBusy, setAdGoldBusy] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(DAILY_CHEST_KEY)
      .then((v) => setChestClaimedToday(v === todayKey()))
      .catch(() => setChestClaimedToday(false));
    AsyncStorage.getItem(AD_GOLD_KEY)
      .then((raw) => {
        if (!raw) return setAdGoldCount(0);
        try {
          const parsed = JSON.parse(raw) as { day?: string; count?: number };
          setAdGoldCount(parsed.day === todayKey() ? Math.max(0, parsed.count ?? 0) : 0);
        } catch {
          setAdGoldCount(0);
        }
      })
      .catch(() => setAdGoldCount(0));
  }, []);

  const watchAdForGold = async () => {
    if (adGoldBusy || adGoldCount === null || adGoldCount >= AD_GOLD_MAX_PER_DAY) return;
    setAdGoldBusy(true);
    try {
      const watched = await showRewardedAd('gold_boost');
      if (!watched) return;
      const gold = adGoldAmount(game.player.level);
      // Créditer d'abord, puis marquer le compteur : en cas de crash au milieu,
      // le joueur ne perd jamais sa récompense (au pire une pub bonus).
      game.addGold(gold);
      const nextCount = adGoldCount + 1;
      await AsyncStorage.setItem(AD_GOLD_KEY, JSON.stringify({ day: todayKey(), count: nextCount }));
      setAdGoldCount(nextCount);
      setFeedback(`+${gold} or ajoutés à ta bourse ! (${nextCount}/${AD_GOLD_MAX_PER_DAY} aujourd'hui)`);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } finally {
      setAdGoldBusy(false);
    }
  };

  const claimDailyChest = async () => {
    if (chestBusy || chestClaimedToday !== false) return;
    setChestBusy(true);
    try {
      const watched = await showRewardedAd('daily_chest');
      if (!watched) return;
      const gold = 150 + game.player.level * 25;
      const mat1 = CHEST_MATERIALS[Math.floor(Math.random() * CHEST_MATERIALS.length)];
      let mat2 = CHEST_MATERIALS[Math.floor(Math.random() * CHEST_MATERIALS.length)];
      if (mat2 === mat1) mat2 = CHEST_MATERIALS[(CHEST_MATERIALS.indexOf(mat1) + 1) % CHEST_MATERIALS.length];
      // Créditer d'abord, puis marquer le jour : en cas de crash au milieu,
      // le joueur ne perd jamais sa récompense (au pire un coffre bonus).
      game.addGold(gold);
      game.addResource(mat1, 3);
      game.addResource(mat2, 2);
      await AsyncStorage.setItem(DAILY_CHEST_KEY, todayKey());
      setChestClaimedToday(true);
      setFeedback(`Coffre du jour ouvert : +${gold} or, +3 ${mat1}, +2 ${mat2} !`);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } finally {
      setChestBusy(false);
    }
  };

  const current = offerings?.current;
  const packages = current?.availablePackages ?? [];
  const goldPackages = packages.filter(
    (p) => GOLD_PRODUCTS[baseProductId(p.product.identifier)] !== undefined,
  );
  const premiumPackage = packages.find(
    (p) => baseProductId(p.product.identifier) === 'forge_premium',
  );
  const resourcePackages = packages.filter(
    (p) => RESOURCE_PRODUCTS[baseProductId(p.product.identifier)] !== undefined,
  );

  const doPurchase = async (pkg: PurchasesPackage) => {
    setConfirmPkg(null);
    try {
      await purchase(pkg);
      const goldAmount = GOLD_PRODUCTS[baseProductId(pkg.product.identifier)];
      const resourcePack = RESOURCE_PRODUCTS[baseProductId(pkg.product.identifier)];
      if (goldAmount) {
        // Gold is granted idempotently by GoldGrantReconciler — never directly here.
        setFeedback(`Achat confirmé — +${goldAmount.toLocaleString()} or arrivent dans ta bourse !`);
      } else if (resourcePack) {
        // Resources granted idempotently by GoldGrantReconciler — never directly here.
        setFeedback(`${resourcePack.name} reçu — matériaux ajoutés à ton inventaire !`);
      } else {
        setFeedback('Forge Premium activé — XP de forge doublée !');
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      if (!e?.userCancelled) {
        setFeedback("L'achat n'a pas pu aboutir. Réessaie plus tard.");
      }
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top + 8 }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.foreground }]}>BOUTIQUE</Text>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Feather name="x" size={22} color={colors.mutedForeground} />
        </TouchableOpacity>
      </View>

      {!available ? (
        <View style={styles.center}>
          <Feather name="cloud-off" size={28} color={colors.mutedForeground} />
          <Text style={[styles.cardDesc, { color: colors.mutedForeground, marginTop: 10, textAlign: 'center' }]}>
            Boutique indisponible pour le moment.{'\n'}Réessaie plus tard.
          </Text>
        </View>
      ) : isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 24, gap: 12 }}>
          {feedback && (
            <View style={[styles.feedback, { backgroundColor: colors.card, borderColor: colors.accent + '66' }]}>
              <Feather name="check-circle" size={14} color={colors.accent} />
              <Text style={[styles.feedbackText, { color: colors.foreground }]}>{feedback}</Text>
            </View>
          )}

          {/* Coffre quotidien gratuit (pub récompensée) */}
          <Text style={[styles.sectionLabel, { color: colors.primary }]}>GRATUIT DU JOUR</Text>
          {adsUnlocked ? (
            <>
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.accent + '55' }]}>
              <View style={styles.cardRow}>
                <Feather name="play-circle" size={20} color={colors.accent} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.cardTitle, { color: colors.foreground }]}>Or contre une pub</Text>
                  <Text style={[styles.cardDesc, { color: colors.mutedForeground }]}>
                    Regarde une courte pub et gagne +{adGoldAmount(game.player.level)} or —{' '}
                    {AD_GOLD_MAX_PER_DAY} fois par jour
                  </Text>
                </View>
              </View>
              {adGoldCount !== null && adGoldCount >= AD_GOLD_MAX_PER_DAY ? (
                <View style={[styles.buyBtn, { backgroundColor: colors.accent + '22' }]}>
                  <Text style={[styles.buyBtnText, { color: colors.accent }]}>
                    Limite du jour atteinte — reviens demain ✦
                  </Text>
                </View>
              ) : (
                <TouchableOpacity
                  style={[styles.buyBtn, { backgroundColor: colors.accent }]}
                  onPress={watchAdForGold}
                  disabled={adGoldBusy || adGoldCount === null}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.buyBtnText, { color: '#1A1208' }]}>
                    {adGoldBusy
                      ? 'Publicité en cours…'
                      : `+${adGoldAmount(game.player.level)} or contre une pub (${adGoldCount ?? 0}/${AD_GOLD_MAX_PER_DAY})`}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.accent + '55' }]}>
              <View style={styles.cardRow}>
                <Feather name="gift" size={20} color={colors.accent} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.cardTitle, { color: colors.foreground }]}>Coffre rare du jour</Text>
                  <Text style={[styles.cardDesc, { color: colors.mutedForeground }]}>
                    Regarde une courte pub et repars avec de l'or et des matériaux rares
                  </Text>
                </View>
              </View>
              {chestClaimedToday ? (
                <View style={[styles.buyBtn, { backgroundColor: colors.accent + '22' }]}>
                  <Text style={[styles.buyBtnText, { color: colors.accent }]}>Déjà ouvert — reviens demain ✦</Text>
                </View>
              ) : (
                <TouchableOpacity
                  style={[styles.buyBtn, { backgroundColor: colors.accent }]}
                  onPress={claimDailyChest}
                  disabled={chestBusy || chestClaimedToday === null}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.buyBtnText, { color: '#1A1208' }]}>
                    {chestBusy ? 'Ouverture…' : 'Ouvrir gratuitement'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
            </>
          ) : (
            <Text style={[styles.cardDesc, { color: colors.mutedForeground }]}>
              Débloqué au niveau {ADS_UNLOCK_LEVEL} du forgeron — continue de forger !
            </Text>
          )}

          {/* Travailleurs d'Élite — achetables en or */}
          <Text style={[styles.sectionLabel, { color: '#9966CC' }]}>TRAVAILLEURS D'ÉLITE</Text>
          {(['elite_miner', 'elite_lumberjack'] as const).map((eliteType) => {
            const def = WORKER_DEFINITIONS[eliteType];
            const alreadyHired = game.workers.filter((w) => w.type === eliteType).length;
            const canAfford = game.player.gold >= def.hireCost;
            return (
              <View key={eliteType} style={[styles.card, { backgroundColor: colors.card, borderColor: '#9966CC55' }]}>
                <View style={styles.cardRow}>
                  <Text style={{ fontSize: 22 }}>{def.emoji}</Text>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Text style={[styles.cardTitle, { color: colors.foreground }]}>{def.name}</Text>
                      <View style={{ backgroundColor: '#9966CC33', borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2 }}>
                        <Text style={{ fontSize: 9, fontWeight: '800', color: '#B58CDF' }}>ÉLITE</Text>
                      </View>
                    </View>
                    <Text style={[styles.cardDesc, { color: colors.mutedForeground }]}>{def.description}</Text>
                    {alreadyHired > 0 && (
                      <Text style={[styles.cardDesc, { color: '#9966CC', marginTop: 3 }]}>
                        {alreadyHired} en service · recrutez-en d'autres →
                      </Text>
                    )}
                  </View>
                </View>
                <TouchableOpacity
                  style={[
                    styles.buyBtn,
                    { backgroundColor: canAfford ? '#9966CC' : colors.muted },
                  ]}
                  onPress={() => {
                    const result = game.hireWorker(eliteType);
                    setFeedback(result.message);
                    if (result.success) {
                      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                    } else {
                      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
                    }
                  }}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.buyBtnText, { color: canAfford ? '#FFFFFF' : colors.mutedForeground }]}>
                    {canAfford
                      ? `Recruter · ${def.hireCost.toLocaleString()} or`
                      : `Or insuffisant (${def.hireCost.toLocaleString()}g requis — vous avez ${game.player.gold.toLocaleString()}g)`}
                  </Text>
                </TouchableOpacity>
              </View>
            );
          })}

          {/* Premium */}
          <Text style={[styles.sectionLabel, { color: colors.primary }]}>FORGE PREMIUM</Text>
          {premiumPackage ? (
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: '#9966CC55' }]}>
              <View style={styles.cardRow}>
                <Feather name="zap" size={20} color="#9966CC" />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.cardTitle, { color: colors.foreground }]}>
                    {premiumPackage.product.title || 'Forge Premium'}
                  </Text>
                  <Text style={[styles.cardDesc, { color: colors.mutedForeground }]}>
                    XP de forge doublée · soutiens le forgeron
                  </Text>
                </View>
              </View>
              {isSubscribed ? (
                <View style={[styles.buyBtn, { backgroundColor: '#9966CC33' }]}>
                  <Text style={[styles.buyBtnText, { color: '#B58CDF' }]}>ACTIF ✦</Text>
                </View>
              ) : (
                <TouchableOpacity
                  style={[styles.buyBtn, { backgroundColor: '#9966CC' }]}
                  onPress={() => setConfirmPkg(premiumPackage)}
                  disabled={isPurchasing}
                  activeOpacity={0.85}
                >
                  <Text style={styles.buyBtnText}>
                    {premiumPackage.product.priceString} / mois
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          ) : (
            <Text style={[styles.cardDesc, { color: colors.mutedForeground }]}>Indisponible pour le moment.</Text>
          )}

          {/* Resource packs */}
          <Text style={[styles.sectionLabel, { color: colors.primary }]}>PACKS DE RESSOURCES</Text>
          {resourcePackages.length > 0 ? resourcePackages.map((pkg) => {
            const pack = RESOURCE_PRODUCTS[baseProductId(pkg.product.identifier)];
            return (
              <View key={pkg.identifier} style={[styles.card, { backgroundColor: colors.card, borderColor: '#C9A22755' }]}>
                <View style={styles.cardRow}>
                  <Feather name={pack.icon as any} size={22} color="#C9A227" />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.cardTitle, { color: colors.foreground }]}>{pack.name}</Text>
                    <Text style={[styles.cardDesc, { color: colors.mutedForeground }]}>{pack.tagline}</Text>
                  </View>
                </View>
                <View style={styles.resourceList}>
                  {pack.items.map(({ resourceId, qty }) => (
                    <View key={resourceId} style={[styles.resourceChip, { backgroundColor: colors.secondary }]}>
                      <Text style={[styles.resourceChipText, { color: colors.foreground }]}>
                        {getResourceNameMap()[resourceId] ?? resourceId.replace(/_/g, ' ')} ×{qty}
                      </Text>
                    </View>
                  ))}
                </View>
                <TouchableOpacity
                  style={[styles.buyBtn, { backgroundColor: '#C9A227' }]}
                  onPress={() => setConfirmPkg(pkg)}
                  disabled={isPurchasing}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.buyBtnText, { color: '#1A1208' }]}>{pkg.product.priceString}</Text>
                </TouchableOpacity>
              </View>
            );
          }) : (
            <Text style={[styles.cardDesc, { color: colors.mutedForeground }]}>Aucun pack disponible.</Text>
          )}

          {/* Gold packs */}
          <Text style={[styles.sectionLabel, { color: colors.primary }]}>PACKS D'OR</Text>
          {goldPackages.map((pkg) => {
            const gold = GOLD_PRODUCTS[baseProductId(pkg.product.identifier)];
            return (
              <View key={pkg.identifier} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.accent + '44' }]}>
                <View style={styles.cardRow}>
                  <Feather name={gold >= 5000 ? 'archive' : 'shopping-bag'} size={20} color={colors.accent} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.cardTitle, { color: colors.foreground }]}>
                      {pkg.product.title || pkg.identifier}
                    </Text>
                    <Text style={[styles.cardDesc, { color: colors.mutedForeground }]}>
                      +{gold.toLocaleString()} pièces d'or
                    </Text>
                  </View>
                </View>
                <TouchableOpacity
                  style={[styles.buyBtn, { backgroundColor: colors.accent }]}
                  onPress={() => setConfirmPkg(pkg)}
                  disabled={isPurchasing}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.buyBtnText, { color: '#1A1208' }]}>{pkg.product.priceString}</Text>
                </TouchableOpacity>
              </View>
            );
          })}
          {goldPackages.length === 0 && (
            <Text style={[styles.cardDesc, { color: colors.mutedForeground }]}>Aucun pack disponible.</Text>
          )}

          <TouchableOpacity onPress={() => restore()} disabled={isRestoring} style={styles.restore}>
            <Text style={[styles.restoreText, { color: colors.mutedForeground }]}>
              {isRestoring ? 'Restauration…' : 'Restaurer mes achats'}
            </Text>
          </TouchableOpacity>

          <Text style={[styles.legal, { color: colors.mutedForeground }]}>
            Forge Premium est un abonnement mensuel à renouvellement automatique. Le montant est
            facturé sur ton compte App Store ou Google Play à la confirmation de l'achat, puis à
            chaque période de renouvellement. Tu peux annuler à tout moment dans les réglages
            d'abonnement de ton store, au moins 24 h avant la fin de la période en cours. Les packs
            d'or sont des achats uniques non remboursables une fois consommés.
          </Text>

          <View style={styles.legalLinks}>
            <TouchableOpacity onPress={openTermsOfUse}>
              <Text style={[styles.restoreText, { color: colors.mutedForeground }]}>
                Conditions d'utilisation
              </Text>
            </TouchableOpacity>
            <Text style={[styles.restoreText, { color: colors.mutedForeground }]}> · </Text>
            <TouchableOpacity onPress={openPrivacyPolicy}>
              <Text style={[styles.restoreText, { color: colors.mutedForeground }]}>
                Politique de confidentialité
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      )}

      {/* Purchase confirmation modal (custom — no Alert.alert) */}
      <Modal visible={confirmPkg !== null} transparent animationType="fade" onRequestClose={() => setConfirmPkg(null)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.accent + '55' }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>Confirmer l'achat</Text>
            <Text style={[styles.modalDesc, { color: colors.mutedForeground }]}>
              {confirmPkg?.product.title} — {confirmPkg?.product.priceString}
            </Text>
            <TouchableOpacity onPress={openTermsOfUse} style={{ alignSelf: 'center', marginTop: 8 }}>
              <Text style={[styles.restoreText, { color: colors.mutedForeground, textDecorationLine: 'underline' }]}>
                Conditions d'utilisation
              </Text>
            </TouchableOpacity>
            <View style={styles.modalActions}>
              <TouchableOpacity style={[styles.modalBtn, { backgroundColor: colors.background }]} onPress={() => setConfirmPkg(null)}>
                <Text style={[styles.buyBtnText, { color: colors.mutedForeground }]}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: colors.accent }]}
                onPress={() => confirmPkg && doPurchase(confirmPkg)}
                disabled={isPurchasing}
              >
                {isPurchasing ? (
                  <ActivityIndicator size="small" color="#1A1208" />
                ) : (
                  <Text style={[styles.buyBtnText, { color: '#1A1208' }]}>Acheter</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 16 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  title: { fontSize: 18, fontWeight: '800', letterSpacing: 3 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  sectionLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 2, marginTop: 10 },
  card: { borderWidth: 1, borderRadius: 14, padding: 14, gap: 12 },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cardTitle: { fontSize: 15, fontWeight: '700' },
  cardDesc: { fontSize: 12, marginTop: 2 },
  buyBtn: { borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  buyBtnText: { fontSize: 13, fontWeight: '800', color: '#FFFFFF', letterSpacing: 0.5 },
  restore: { alignItems: 'center', paddingVertical: 14 },
  legalLinks: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12 },
  legal: { fontSize: 10, lineHeight: 15, opacity: 0.7, marginTop: 4 },
  restoreText: { fontSize: 12, textDecorationLine: 'underline' },
  feedback: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 10, padding: 10 },
  feedbackText: { fontSize: 12, flex: 1 },
  resourceList: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  resourceChip: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
  resourceChipText: { fontSize: 11, fontWeight: '600' },
  modalBackdrop: { flex: 1, backgroundColor: '#000000AA', alignItems: 'center', justifyContent: 'center', padding: 24 },
  modalCard: { width: '100%', borderWidth: 1, borderRadius: 16, padding: 18, gap: 10 },
  modalTitle: { fontSize: 16, fontWeight: '800' },
  modalDesc: { fontSize: 13 },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 8 },
  modalBtn: { flex: 1, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
});
