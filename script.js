const fs = require('fs');

const content = fs.readFileSync('artifacts/mobile/app/(tabs)/index.tsx', 'utf-8');

// The issue was we had a missing import or something. Let's fix the imports.
let updatedContent = content.replace(
  "import {",
  "import {\n  ImageBackground,"
);
updatedContent = updatedContent.replace(
  "import { Feather } from '@expo/vector-icons';",
  "import { Feather } from '@expo/vector-icons';\nimport { useRouter } from 'expo-router';"
);

// We need to keep everything up to ForgeScreen.
const beforeForgeScreen = updatedContent.substring(0, updatedContent.indexOf('export default function ForgeScreen()'));

const apprenticeCardMatch = updatedContent.match(/\/\/ ─── Apprentice Card ───[\s\S]*?(?=\/\/ ─── Idle Panel ───)/);
const apprenticeCard = apprenticeCardMatch ? apprenticeCardMatch[0] : '';

// 3. New IdleUI
const newIdleUI = `
// ─── Idle UI (Nouvelle disposition) ──────────────────────────────────────────
function IdleUI({
  game,
  colors,
  forgeSkillLevel,
  forgeXPPct,
  xpPct,
  onStartCraft,
  setShowUpgradesModal,
  setShowOrdersModal,
  bottomPad,
}: {
  game: ReturnType<typeof useGame>;
  colors: ReturnType<typeof useColors>;
  forgeSkillLevel: number;
  forgeXPPct: number;
  xpPct: number;
  onStartCraft: () => void;
  setShowUpgradesModal: (v: boolean) => void;
  setShowOrdersModal: (v: boolean) => void;
  bottomPad: number;
}) {
  const router = useRouter();
  const { player } = game;
  const insets = useSafeAreaInsets();
  
  const pendingCount = game.activeOrders.filter((o) => !o.completed).length;
  
  // Right Rail: Materials
  const materials = game.inventory.slice(0, 8); // first 8
  
  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 5, paddingBottom: bottomPad }]} pointerEvents="box-none">
      
      {/* ── Left Rail ── */}
      <View style={[idleStyles.leftRail, { top: insets.top + 90 }]} pointerEvents="box-none">
        <TouchableOpacity style={idleStyles.railBtn} activeOpacity={0.8} onPress={() => router.push('/codex')}>
          <View style={[idleStyles.railCircle, { backgroundColor: 'rgba(10,8,6,0.85)', borderColor: '#5C4830' }]}>
            <Feather name="book-open" size={20} color="#C9A227" />
          </View>
          <Text style={idleStyles.railLabel}>QUÊTES</Text>
        </TouchableOpacity>
        
        <TouchableOpacity style={idleStyles.railBtn} activeOpacity={0.8} onPress={() => router.push('/world')}>
          <View style={[idleStyles.railCircle, { backgroundColor: 'rgba(10,8,6,0.85)', borderColor: '#5C4830' }]}>
            <Feather name="map" size={20} color="#C9A227" />
          </View>
          <Text style={idleStyles.railLabel}>ÉVÉNEMENTS</Text>
        </TouchableOpacity>
        
        <TouchableOpacity style={idleStyles.railBtn} activeOpacity={0.8} onPress={() => setShowUpgradesModal(true)}>
          <View style={[idleStyles.railCircle, { backgroundColor: 'rgba(10,8,6,0.85)', borderColor: '#5C4830' }]}>
            <Feather name="box" size={20} color="#C9A227" />
          </View>
          <Text style={idleStyles.railLabel}>COFFRES</Text>
        </TouchableOpacity>
        
        <TouchableOpacity style={idleStyles.railBtn} activeOpacity={0.8} onPress={() => router.push('/profile')}>
          <View style={[idleStyles.railCircle, { backgroundColor: 'rgba(10,8,6,0.85)', borderColor: '#5C4830' }]}>
            <Feather name="award" size={20} color="#C9A227" />
          </View>
          <Text style={idleStyles.railLabel}>CLASSEMENT</Text>
        </TouchableOpacity>
      </View>

      {/* ── Right Rail: Matériaux ── */}
      <View style={[idleStyles.rightRail, { top: insets.top + 90 }]} pointerEvents="auto">
        <View style={[idleStyles.materialsPanel, { backgroundColor: 'rgba(10,8,6,0.72)', borderColor: '#E8862A' }]}>
          <Text style={idleStyles.materialsTitle}>MATÉRIAUX</Text>
          <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
            {materials.map((invItem) => {
              const res = game.getResourceById(invItem.resourceId);
              if (!res) return null;
              return (
                <View key={invItem.resourceId} style={idleStyles.matRow}>
                  <View style={idleStyles.matRowLeft}>
                    <View style={[idleStyles.matColorBox, { backgroundColor: res.color }]} />
                    <Text style={idleStyles.matName} numberOfLines={1}>{res.name.toUpperCase()}</Text>
                  </View>
                  <Text style={idleStyles.matQty}>{invItem.quantity}</Text>
                </View>
              );
            })}
            {materials.length === 0 && (
              <Text style={[idleStyles.matName, { textAlign: 'center', marginTop: 10, opacity: 0.5 }]}>VIDE</Text>
            )}
          </ScrollView>
        </View>
      </View>

      {/* ── Bottom Section ── */}
      <View style={idleStyles.bottomSection} pointerEvents="box-none">
        
        {/* Apprentice Card */}
        {game.apprentice !== null && (
          <View style={{ marginBottom: 16, width: '100%', paddingHorizontal: 16 }}>
            <ApprenticeCard game={game} colors={colors} />
          </View>
        )}

        {/* Action Buttons Row */}
        <View style={idleStyles.actionRow}>
          <TouchableOpacity 
            style={[idleStyles.sideBtn, { backgroundColor: 'rgba(20,15,10,0.85)', borderColor: '#5C4830' }]}
            activeOpacity={0.8}
            onPress={() => setShowUpgradesModal(true)}
          >
            <Feather name="tool" size={22} color="#C9A227" />
            <Text style={idleStyles.sideBtnText}>AMÉLIORER</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={idleStyles.forgeBtn}
            activeOpacity={0.85}
            onPress={onStartCraft}
          >
            <LinearGradient
              colors={['#E8862A', '#A03A00']}
              style={idleStyles.forgeBtnGradient}
            >
              <View style={idleStyles.forgeBtnInner}>
                <Feather name="bold" size={32} color="#fff" />
                <Text style={idleStyles.forgeBtnText}>FORGER</Text>
              </View>
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[idleStyles.sideBtn, { backgroundColor: 'rgba(20,15,10,0.85)', borderColor: '#5C4830' }]}
            activeOpacity={0.8}
            onPress={() => setShowOrdersModal(true)}
          >
            <View>
              <Feather name="file-text" size={22} color="#C9A227" />
              {pendingCount > 0 && (
                <View style={idleStyles.badge}>
                  <Text style={idleStyles.badgeText}>{pendingCount}</Text>
                </View>
              )}
            </View>
            <Text style={idleStyles.sideBtnText}>COMMANDES</Text>
          </TouchableOpacity>
        </View>

        {/* Inventory Mini-bar */}
        <TouchableOpacity 
          style={[idleStyles.inventoryBar, { backgroundColor: 'rgba(26,20,16,0.9)', borderColor: '#5C4830' }]}
          activeOpacity={0.8}
          onPress={() => router.push('/inventory')}
        >
          <Feather name="archive" size={16} color="#C9A227" />
          <Text style={idleStyles.inventoryText}>INVENTAIRE</Text>
        </TouchableOpacity>

      </View>
    </View>
  );
}

const idleStyles = StyleSheet.create({
  leftRail: {
    position: 'absolute',
    left: 10,
    gap: 16,
    zIndex: 10,
  },
  railBtn: {
    alignItems: 'center',
    gap: 4,
  },
  railCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.6,
    shadowRadius: 4,
    elevation: 5,
  },
  railLabel: {
    color: '#C9A227',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1,
    textShadowColor: '#000',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  rightRail: {
    position: 'absolute',
    right: 10,
    width: '38%',
    maxHeight: '50%',
    zIndex: 10,
  },
  materialsPanel: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.8,
    shadowRadius: 6,
    elevation: 6,
  },
  materialsTitle: {
    color: '#C9A227',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 2,
    marginBottom: 10,
    textAlign: 'center',
  },
  matRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  matRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  matColorBox: {
    width: 10,
    height: 10,
    borderRadius: 2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  matName: {
    color: '#E0D4C8',
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.5,
    flex: 1,
  },
  matQty: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: '700',
  },
  bottomSection: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 16,
    marginBottom: 16,
  },
  sideBtn: {
    width: 90,
    height: 70,
    borderRadius: 12,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.6,
    shadowRadius: 4,
    elevation: 5,
  },
  sideBtnText: {
    color: '#E0D4C8',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  badge: {
    position: 'absolute',
    top: -6,
    right: -10,
    backgroundColor: '#D32F2F',
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#fff',
  },
  badgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '800',
  },
  forgeBtn: {
    width: 140,
    height: 90,
    shadowColor: '#FF7A1A',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 15,
    elevation: 10,
  },
  forgeBtnGradient: {
    flex: 1,
    borderRadius: 16,
    padding: 2,
  },
  forgeBtnInner: {
    flex: 1,
    backgroundColor: '#3A2415',
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#FF7A1A',
    gap: 4,
  },
  forgeBtnText: {
    color: '#FFD54F',
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 2,
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 2,
  },
  inventoryBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 8,
  },
  inventoryText: {
    color: '#E0D4C8',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.5,
  },
});
`;

// 4. Update ForgeScreen
const forgeScreenMatch = updatedContent.match(/export default function ForgeScreen\(\) \{[\s\S]*?\n\}\n/);
let newForgeScreen = forgeScreenMatch[0];

const newReturn = `  return (
    <ImageBackground
      source={require('@/assets/images/forge-bg.jpg')}
      style={styles.container}
      resizeMode="cover"
    >
      {/* Base gradients for readability */}
      <LinearGradient colors={['rgba(0,0,0,0.8)', 'transparent']} style={styles.topGradient} pointerEvents="none" />
      <LinearGradient colors={['transparent', 'rgba(0,0,0,0.9)']} style={styles.bottomGradient} pointerEvents="none" />

      {/* Dark overlay during active phases */}
      {craftPhase !== 'IDLE' && (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.55)', zIndex: 1 }]} pointerEvents="none" />
      )}

      {/* ── Header ── */}
      <View style={[styles.header, { paddingTop: headerTopPad + 12, zIndex: 10 }]} pointerEvents="box-none">
        <View style={styles.headerLeft}>
          <View style={styles.levelRing}>
            <Text style={styles.levelRingText}>{player.level}</Text>
          </View>
          <View>
            <Text style={styles.headerTitle}>FORGERON</Text>
            <Text style={styles.headerXP}>{player.xp} / {player.xpToNextLevel} XP</Text>
          </View>
        </View>
        <View style={styles.headerRight}>
          <View style={styles.headerPill}>
            <Text style={{ fontSize: 14 }}>🪙</Text>
            <Text style={styles.headerPillText}>{player.gold.toLocaleString()}</Text>
          </View>
          <View style={styles.headerPill}>
            <Feather name="award" size={12} color="#4FC3F7" />
            <Text style={[styles.headerPillText, { color: '#FFF' }]}>{forgeSkillLevel}</Text>
          </View>
          <TouchableOpacity style={styles.headerGear} onPress={() => setShowUpgradesModal(true)}>
            <Feather name="settings" size={16} color="#C9A227" />
          </TouchableOpacity>
        </View>
      </View>

      {/* ── 3D Scene ── */}
      <View style={[styles.sceneContainer, { zIndex: 0 }]}>
        <ForgeScene3D ref={sceneRef} craftPhase={craftPhase} upgradeLevel={upgradeLevel} />
        <WeatherEffect type={weather} />

        {/* Heating overlay */}
        {craftPhase === 'HEATING' && (
          <View style={styles.phaseOverlay} pointerEvents="none">
            <View style={styles.heatingContent}>
              <Text style={[styles.phaseTitle, { color: '#E8862A' }]}>
                🔥 Chauffe le métal…
              </Text>
              {selectedRecipe && (
                <Text style={[styles.recipeNameSmall, { color: '#E0D4C8' }]}>
                  {selectedRecipe.name}
                </Text>
              )}
              <View style={[styles.heatingTrack, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
                <View
                  style={[
                    styles.heatingFill,
                    {
                      width: \`\${heatingProgress * 100}%\`,
                      backgroundColor: '#E8862A',
                    },
                  ]}
                />
              </View>
              <Text style={[styles.heatingPct, { color: '#E8862A' }]}>
                {Math.round(heatingProgress * 100)}%
              </Text>
            </View>
          </View>
        )}

        {/* Cooling overlay */}
        {craftPhase === 'COOLING' && (
          <View style={styles.phaseOverlay} pointerEvents="none">
            <View style={styles.heatingContent}>
              <Text style={[styles.phaseTitle, { color: '#48A0D0' }]}>
                💧 Refroidissement…
              </Text>
            </View>
          </View>
        )}

        {/* Hit label flash */}
        {lastHitLabel && (
          <View style={styles.hitFlash} pointerEvents="none">
            <Text
              style={[
                styles.hitFlashText,
                { color: lastHitLabel === 'PARFAIT!' ? '#9966CC' : lastHitLabel === 'RATÉ' ? colors.destructive : colors.accent },
              ]}
            >
              {lastHitLabel}
            </Text>
          </View>
        )}
      </View>

      {/* ── Active Phase UI ── */}
      {craftPhase !== 'IDLE' && (
        <View style={[styles.bottomPanel, { paddingBottom: bottomPad, zIndex: 10 }]} pointerEvents="box-none">
          {craftPhase === 'HAMMERING' && (
            <View>
              {showEventBanner && activeForgeEvent && (
                <View style={[styles.eventBanner, { borderColor: activeForgeEvent.color + '80', backgroundColor: activeForgeEvent.color + '18' }]}>
                  <Text style={styles.eventEmoji}>{activeForgeEvent.emoji}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.eventName, { color: activeForgeEvent.color }]}>{activeForgeEvent.name}</Text>
                    <Text style={[styles.eventDesc, { color: '#E0D4C8' }]}>{activeForgeEvent.description}</Text>
                  </View>
                </View>
              )}
              <HammeringMiniGame
                strikesCompleted={session.strikesCompleted}
                strikeScores={session.strikeScores}
                onStrike={handleStrike}
                forgeSkillLevel={forgeSkillLevel}
              />
            </View>
          )}

          {(craftPhase === 'HEATING' || craftPhase === 'COOLING') && (
            <View style={styles.inProgressPanel}>
              <Feather
                name={craftPhase === 'HEATING' ? 'thermometer' : 'droplet'}
                size={22}
                color={craftPhase === 'HEATING' ? '#E8862A' : '#48A0D0'}
              />
              <Text style={[styles.inProgressText, { color: '#E0D4C8' }]}>
                {craftPhase === 'HEATING'
                  ? 'Le métal chauffe dans le four…'
                  : 'Trempe dans l\\'eau…'}
              </Text>
            </View>
          )}
        </View>
      )}

      {/* ── IDLE UI ── */}
      {craftPhase === 'IDLE' && (
        <IdleUI
          game={game}
          colors={colors}
          forgeSkillLevel={forgeSkillLevel}
          forgeXPPct={forgeXPPct}
          xpPct={xpPct}
          onStartCraft={() => setShowRecipeSheet(true)}
          setShowUpgradesModal={setShowUpgradesModal}
          setShowOrdersModal={setShowOrdersModal}
          bottomPad={bottomPad}
        />
      )}

      {/* ── Recipe Sheet ── */}
      <Modal visible={showRecipeSheet} transparent animationType="slide" statusBarTranslucent>
        <View style={styles.overlay}>
          <View style={[styles.sheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.sheetHandle, { backgroundColor: colors.muted }]} />
            <View style={styles.sheetTitleRow}>
              <Text style={[styles.sheetTitle, { color: colors.foreground }]}>
                Choisir une recette
              </Text>
              <TouchableOpacity onPress={() => setShowRecipeSheet(false)}>
                <Feather name="x" size={22} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>

            {availableRecipes.length === 0 ? (
              <View style={styles.sheetEmpty}>
                <Feather name="tool" size={32} color={colors.mutedForeground} />
                <Text style={[styles.sheetEmptyText, { color: colors.mutedForeground }]}>
                  Améliorez votre compétence Forge pour débloquer des recettes
                </Text>
              </View>
            ) : (
              <FlatList
                data={availableRecipes}
                keyExtractor={(r) => r.id}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: bottomPad }}
                renderItem={({ item: recipe }) => {
                  const canCraft = game.canCraftRecipe(recipe.id);
                  return (
                    <TouchableOpacity
                      style={[
                        styles.recipeRow,
                        {
                          backgroundColor: colors.secondary,
                          borderColor: canCraft ? colors.primary : colors.border,
                        },
                      ]}
                      onPress={() => startCraft(recipe)}
                      disabled={!canCraft}
                      activeOpacity={0.75}
                    >
                      <View style={styles.recipeRowLeft}>
                        <Text
                          style={[
                            styles.recipeCategory,
                            { color: colors.primary },
                          ]}
                        >
                          {recipe.category.toUpperCase()}
                        </Text>
                        <Text style={[styles.recipeName, { color: canCraft ? colors.foreground : colors.mutedForeground }]}>
                          {recipe.name}
                        </Text>
                        <View style={styles.matList}>
                          {recipe.requirements.map((req) => {
                            const res = game.getResourceById(req.resourceId);
                            const have = game.getInventoryQty(req.resourceId);
                            const ok = have >= req.quantity;
                            return (
                              <Text
                                key={req.resourceId}
                                style={[
                                  styles.matChip,
                                  { color: ok ? colors.accent : colors.destructive },
                                ]}
                              >
                                {have}/{req.quantity} {res?.name ?? req.resourceId}
                              </Text>
                            );
                          })}
                        </View>
                      </View>
                      <View style={styles.recipeRowRight}>
                        <Text style={[styles.recipeXP, { color: colors.accent }]}>
                          +{recipe.xpReward} XP
                        </Text>
                        {canCraft ? (
                          <View style={[styles.forgeBadge, { backgroundColor: colors.primary }]}>
                            <Text style={[styles.forgeBadgeText, { color: colors.primaryForeground }]}>
                              FORGER
                            </Text>
                          </View>
                        ) : (
                          <Feather name="lock" size={18} color={colors.mutedForeground} />
                        )}
                      </View>
                    </TouchableOpacity>
                  );
                }}
              />
            )}
          </View>
        </View>
      </Modal>

      {/* ── Orders Modal ── */}
      <OrdersModal
        visible={showOrdersModal}
        onClose={() => setShowOrdersModal(false)}
        game={game}
        colors={colors}
        bottomPad={bottomPad}
        deliverOrderId={deliverOrderId}
        setDeliverOrderId={setDeliverOrderId}
      />

      {/* ── Forge Upgrades Modal ── */}
      <ForgeUpgradesModal
        visible={showUpgradesModal}
        onClose={() => setShowUpgradesModal(false)}
        game={game}
        colors={colors}
        bottomPad={bottomPad}
      />

      {/* ── Craft Result Modal ── */}
      <Modal visible={craftPhase === 'RESULT' && !!craftedItem} transparent animationType="fade" statusBarTranslucent>
        {craftedItem && (
          <View style={styles.resultOverlay}>
            <View
              style={[
                styles.resultBox,
                {
                  backgroundColor: colors.card,
                  borderColor: qualityColor(craftedItem.quality, colors),
                },
              ]}
            >
              {/* Quality glow bar */}
              <View
                style={[
                  styles.resultQualityBar,
                  { backgroundColor: qualityColor(craftedItem.quality, colors) },
                ]}
              />
              <Text
                style={[
                  styles.resultQualityLabel,
                  { color: qualityColor(craftedItem.quality, colors) },
                ]}
              >
                {qualityLabel(craftedItem.quality)}
              </Text>
              <Text style={[styles.resultItemName, { color: colors.foreground }]}>
                {craftedItem.name}
              </Text>
              <Text style={[styles.resultScore, { color: colors.mutedForeground }]}>
                Score de qualité: {craftedItem.qualityScore}/100
              </Text>

              {/* Active forge event */}
              {activeForgeEvent && (
                <View style={[styles.resultEventRow, { backgroundColor: activeForgeEvent.color + '22', borderColor: activeForgeEvent.color + '66' }]}>
                  <Text style={{ fontSize: 16 }}>{activeForgeEvent.emoji}</Text>
                  <Text style={[styles.resultEventText, { color: activeForgeEvent.color }]}>
                    {activeForgeEvent.name} — {activeForgeEvent.description}
                  </Text>
                </View>
              )}

              {/* Mini-game breakdown */}
              <View style={[styles.resultBreakdown, { backgroundColor: colors.secondary }]}>
                <Text style={[styles.breakdownTitle, { color: colors.mutedForeground }]}>
                  MARTELAGE
                </Text>
                <View style={styles.breakdownRow}>
                  {session.strikeScores.map((s, i) => (
                    <View
                      key={i}
                      style={[
                        styles.breakdownDot,
                        {
                          backgroundColor:
                            s >= 20 ? '#9966CC' : s >= 14 ? colors.accent : s >= 7 ? colors.primary : colors.destructive,
                        },
                      ]}
                    />
                  ))}
                  <Text style={[styles.breakdownScore, { color: colors.accent }]}>
                    {session.strikeScores.reduce((a, b) => a + b, 0)}/
                    {session.strikesCompleted * 25} pts
                  </Text>
                </View>
              </View>

              {/* Stats */}
              <View style={styles.resultStats}>
                {craftedItem.stats.attack !== undefined && (
                  <View style={[styles.statChip, { backgroundColor: colors.secondary }]}>
                    <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>ATQ</Text>
                    <Text style={[styles.statValue, { color: colors.accent }]}>+{craftedItem.stats.attack}</Text>
                  </View>
                )}
                {craftedItem.stats.defense !== undefined && (
                  <View style={[styles.statChip, { backgroundColor: colors.secondary }]}>
                    <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>DEF</Text>
                    <Text style={[styles.statValue, { color: colors.accent }]}>+{craftedItem.stats.defense}</Text>
                  </View>
                )}
                {craftedItem.stats.magic !== undefined && (
                  <View style={[styles.statChip, { backgroundColor: colors.secondary }]}>
                    <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>MAG</Text>
                    <Text style={[styles.statValue, { color: colors.accent }]}>+{craftedItem.stats.magic}</Text>
                  </View>
                )}
                {craftedItem.stats.speed !== undefined && (
                  <View style={[styles.statChip, { backgroundColor: colors.secondary }]}>
                    <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>VIT</Text>
                    <Text style={[styles.statValue, { color: colors.accent }]}>+{craftedItem.stats.speed}</Text>
                  </View>
                )}
              </View>

              <Text style={[styles.resultValue, { color: colors.primary }]}>
                Valeur: {craftedItem.value} pièces d'or
              </Text>
              <Text style={[styles.resultXP, { color: colors.accent }]}>
                +{selectedRecipe?.xpReward ?? 0} XP Forge  ·  +{selectedRecipe?.xpReward ?? 0} XP Joueur
              </Text>

              {/* Forgeron attribution */}
              <View style={[styles.resultAttribution, { backgroundColor: colors.secondary }]}>
                <AvatarCircle color={player.avatarColor} icon={player.avatarIcon} name={player.name} size={24} />
                <Text style={[styles.resultAttributionText, { color: colors.mutedForeground }]}>
                  Forgé par <Text style={{ color: colors.foreground, fontWeight: '700' }}>{player.name}</Text>
                </Text>
              </View>

              <TouchableOpacity
                style={[styles.collectBtn, { backgroundColor: qualityColor(craftedItem.quality, colors) }]}
                onPress={() => {
                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                  resetCraft();
                }}
              >
                <Feather name="package" size={16} color="#fff" />
                <Text style={styles.collectBtnText}>Ajouter à l'inventaire</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </Modal>
    </ImageBackground>
  );
}
`;

newForgeScreen = newForgeScreen.replace(/  return \([\s\S]*?\n  \);\n\}/, newReturn);

// 5. Update styles
const existingStylesMatch = updatedContent.match(/const styles = StyleSheet\.create\(\{[\s\S]*\}\);\n?$/);
let newStyles = existingStylesMatch ? existingStylesMatch[0] : '';

const styleAdditions = `
  topGradient: {
    position: 'absolute',
    top: 0, left: 0, right: 0, height: 160, zIndex: 1,
  },
  bottomGradient: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0, height: 280, zIndex: 1,
  },
  levelRing: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: '#C9A227',
    backgroundColor: 'rgba(26,20,16,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.8,
    shadowRadius: 4,
    elevation: 4,
  },
  levelRingText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '800',
  },
  headerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(26,20,16,0.85)',
    borderWidth: 1,
    borderColor: '#5C4830',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 6,
  },
  headerPillText: {
    color: '#E0D4C8',
    fontSize: 13,
    fontWeight: '700',
  },
  headerGear: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(26,20,16,0.85)',
    borderWidth: 1,
    borderColor: '#5C4830',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerXP: {
    fontSize: 11,
    color: '#A09080',
    fontWeight: '600',
    marginTop: 2,
  },
`;

newStyles = newStyles.replace('headerTitle: { fontSize: 17, fontWeight: \'800\', letterSpacing: 3 },', 'headerTitle: { fontSize: 15, fontWeight: \'800\', letterSpacing: 2, color: \'#C9A227\' },');
newStyles = newStyles.replace('// Header', '// Header\n' + styleAdditions);

const finalContent = beforeForgeScreen + apprenticeCard + '\n' + newIdleUI + '\n' + newForgeScreen + '\n' + newStyles;

fs.writeFileSync('artifacts/mobile/app/(tabs)/index.tsx', finalContent);
