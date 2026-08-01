export default function ForgeScreen() {
  const router = useRouter();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const game = useGame();

  const [craftPhase, setCraftPhase] = useState<CraftPhase>('IDLE');
  const [session, setSession] = useState<CraftSession>(EMPTY_SESSION);
  const [heatingProgress, setHeatingProgress] = useState(0);
  const [craftedItem, setCraftedItem] = useState<Item | null>(null);
  const [showRecipeSheet, setShowRecipeSheet] = useState(false);
  const [lastHitLabel, setLastHitLabel] = useState<HitLabel | null>(null);
  const [showOrdersModal, setShowOrdersModal] = useState(false);
  const [deliverOrderId, setDeliverOrderId] = useState<string | null>(null);
  const [showUpgradesModal, setShowUpgradesModal] = useState(false);
  const [weather, setWeather] = useState<WeatherType>('none');
  const [activeForgeEvent, setActiveForgeEvent] = useState<ForgeEvent | null>(null);
  const [showEventBanner, setShowEventBanner] = useState(false);

  const sceneRef = useRef<ForgeScene3DRef>(null);
  const hitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const headerTopPad = Platform.OS === 'web' ? 67 : insets.top;
  const bottomPad = insets.bottom + (Platform.OS === 'web' ? 34 : 0) + 80;

  // Init audio on mount + weather cycle + forge ambience
  useEffect(() => {
    AudioManager.init();
    // Restore saved mute/volume before starting ambience
    applyStoredAudioSettings();
    // Start the looping fire-crackle ambience when the forge tab is entered
    AudioManager.startForgeAmbience();

    // Web: use the Page Visibility API to suspend/resume the AudioContext so
    // the oscillator graph stays alive and there is no audible gap on return.
    let removeVisibility: (() => void) | undefined;
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const handleVisibilityChange = () => {
        if (document.hidden) {
          AudioManager.suspendForgeAmbience();
        } else {
          AudioManager.resumeForgeAmbience();
        }
      };
      document.addEventListener('visibilitychange', handleVisibilityChange);
      removeVisibility = () => document.removeEventListener('visibilitychange', handleVisibilityChange);
    }

    // Native: pause/resume ambience when the app goes to the background.
    // (On web AppState doesn't fire for tab switches — visibilitychange handles that above.)
    const appStateSub = AppState.addEventListener('change', (nextState) => {
      if (Platform.OS !== 'web') {
        if (nextState === 'active') {
          AudioManager.startForgeAmbience();
        } else {
          AudioManager.stopForgeAmbience();
        }
      }
    });

    // Randomly assign atmospheric weather — changes every 5–10 minutes
    const WEATHER_TYPES: WeatherType[] = ['none', 'none', 'none', 'rain', 'fog', 'rain', 'snow'];
    const pick = () => WEATHER_TYPES[Math.floor(Math.random() * WEATHER_TYPES.length)];
    setWeather(pick());
    const weatherTimer = setInterval(() => setWeather(pick()), 7 * 60 * 1000); // 7 min
    return (
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
                      width: `${heatingProgress * 100}%`,
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
                  : 'Trempe dans l\'eau…'}
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


const styles = StyleSheet.create({
  container: { flex: 1 },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  // Header

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

  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  headerTitle: { fontSize: 15, fontWeight: '800', letterSpacing: 2, color: '#C9A227' },
  headerForgeName: { fontSize: 11, fontWeight: '500', letterSpacing: 1, marginTop: 1 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  pill: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, gap: 3 },
  pillText: { fontSize: 13, fontWeight: '700' },

  // 3D scene
  sceneContainer: { flex: 1, overflow: 'hidden' },

  // Phase overlays (on top of scene)
  phaseOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
  },
  heatingContent: {
    alignItems: 'center',
    paddingHorizontal: 40,
    paddingBottom: 20,
    gap: 8,
  },
  phaseTitle: { fontSize: 18, fontWeight: '800', letterSpacing: 1 },
  recipeNameSmall: { fontSize: 13 },
  heatingTrack: { width: '100%', height: 8, borderRadius: 4, overflow: 'hidden' },
  heatingFill: { height: '100%', borderRadius: 4, minWidth: 4 },
  heatingPct: { fontSize: 14, fontWeight: '700' },

  hitFlash: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    pointerEvents: 'none',
  },
  hitFlashText: { fontSize: 32, fontWeight: '900', letterSpacing: 3 },

  // Bottom panel
  bottomPanel: {
    borderTopWidth: 1,
  },
  inProgressPanel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 24,
    paddingTop: 16,
  },
  inProgressText: { fontSize: 14 },

  // Idle panel
  idlePanel: { paddingHorizontal: 20, paddingTop: 14 },
  forgeStats: { flexDirection: 'row', gap: 16, marginBottom: 14 },
  forgeStat: { flex: 1 },
  forgeStatLabel: { fontSize: 9, fontWeight: '700', letterSpacing: 1.5, marginBottom: 3 },
  forgeStatValue: { fontSize: 17, fontWeight: '800', marginBottom: 4 },
  miniTrack: { height: 4, borderRadius: 2, overflow: 'hidden' },
  miniFill: { height: '100%', borderRadius: 2, minWidth: 3 },
  eventBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginHorizontal: 16,
    marginBottom: 10,
  },
  eventEmoji: { fontSize: 22 },
  eventName: { fontSize: 13, fontWeight: '800' },
  eventDesc: { fontSize: 11, marginTop: 1 },
  resultEventRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
    marginTop: 6,
  },
  resultEventText: { flex: 1, fontSize: 12, fontWeight: '600' },
  startCraftBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 15,
    borderRadius: 14,
    gap: 10,
  },
  startCraftText: { fontSize: 16, fontWeight: '800', letterSpacing: 2 },

  // Recipe sheet
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'flex-end' },
  sheet: {
    maxHeight: '80%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderBottomWidth: 0,
  },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 18 },
  sheetTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  sheetTitle: { fontSize: 20, fontWeight: '700' },
  sheetEmpty: { alignItems: 'center', paddingVertical: 40, gap: 12 },
  sheetEmptyText: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  recipeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    marginBottom: 8,
  },
  recipeRowLeft: { flex: 1 },
  recipeCategory: { fontSize: 9, fontWeight: '700', letterSpacing: 1.5, marginBottom: 4 },
  recipeName: { fontSize: 15, fontWeight: '600', marginBottom: 5 },
  matList: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  matChip: { fontSize: 11 },
  recipeRowRight: { alignItems: 'flex-end', gap: 8, paddingLeft: 12 },
  recipeXP: { fontSize: 12, fontWeight: '600' },
  forgeBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  forgeBadgeText: { fontSize: 12, fontWeight: '700', letterSpacing: 1 },

  // Result modal
  resultOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', justifyContent: 'center', padding: 20 },
  resultBox: { borderRadius: 20, borderWidth: 2, padding: 24, overflow: 'hidden' },
  resultQualityBar: { height: 4, borderRadius: 2, marginBottom: 14 },
  resultQualityLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 3, marginBottom: 6 },
  resultItemName: { fontSize: 28, fontWeight: '900', marginBottom: 4 },
  resultScore: { fontSize: 13, marginBottom: 16 },
  resultBreakdown: { borderRadius: 10, padding: 12, marginBottom: 16 },
  breakdownTitle: { fontSize: 10, fontWeight: '700', letterSpacing: 1.5, marginBottom: 8 },
  breakdownRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  breakdownDot: { width: 16, height: 16, borderRadius: 8 },
  breakdownScore: { fontSize: 14, fontWeight: '700', marginLeft: 'auto' },
  resultStats: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 14 },
  statChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, alignItems: 'center', minWidth: 64 },
  statLabel: { fontSize: 9, fontWeight: '700', letterSpacing: 1 },
  statValue: { fontSize: 18, fontWeight: '800' },
  resultValue: { fontSize: 16, fontWeight: '700', marginBottom: 4 },
  resultXP: { fontSize: 13, marginBottom: 20 },
  resultAttribution: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 16,
  },
  resultAttributionText: { fontSize: 12 },
  collectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    gap: 10,
  },
  collectBtnText: { fontSize: 15, fontWeight: '800', color: '#fff' },
});
