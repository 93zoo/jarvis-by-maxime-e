import React, { useEffect, useRef, useState } from 'react';
import {
  FlatList,
  Keyboard,
  Linking,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as Contacts from 'expo-contacts';
import * as Haptics from 'expo-haptics';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// ── Local contact shape (avoids expo-contacts class-vs-type confusion) ─────────

interface RawContact {
  id?: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  phoneNumbers?: Array<{ number?: string; label?: string }>;
}

// ── Public types ───────────────────────────────────────────────────────────────

export interface PickedContact {
  name: string;
  number: string;
}

interface ContactsPickerProps {
  visible: boolean;
  onClose: () => void;
  onJarvisCompose: (contact: PickedContact) => void;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function displayName(c: RawContact): string {
  if (c.name) return c.name;
  return [c.firstName, c.lastName].filter(Boolean).join(' ') || '?';
}

function initials(name: string) {
  const parts = name.trim().split(' ');
  return parts.length >= 2
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : name.slice(0, 2).toUpperCase();
}

function stripNumber(n: string) {
  // Keep only digits and leading +, e.g. +33612345678
  return n.replace(/[^\d+]/g, '').replace(/(?!^)\+/g, '');
}

const COLORS = ['#0099FF', '#00E0FF', '#C084FC', '#F472B6', '#34D399', '#FB923C', '#818CF8', '#4CAF50'];
function avatarColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffff;
  return COLORS[h % COLORS.length];
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ContactsPicker({ visible, onClose, onJarvisCompose }: ContactsPickerProps) {
  const insets = useSafeAreaInsets();
  const searchRef = useRef<TextInput>(null);

  const [contacts, setContacts]     = useState<RawContact[]>([]);
  const [query, setQuery]           = useState('');
  const [loading, setLoading]       = useState(false);
  const [permDenied, setPermDenied] = useState(false);
  const [selected, setSelected]     = useState<PickedContact | null>(null);
  const [smsBody, setSmsBody]       = useState('');
  const [smsMode, setSmsMode]       = useState(false);

  useEffect(() => {
    if (!visible) {
      setSelected(null);
      setQuery('');
      setSmsBody('');
      setSmsMode(false);
      return;
    }
    loadContacts();
    const t = setTimeout(() => searchRef.current?.focus(), 350);
    return () => clearTimeout(t);
  }, [visible]);

  async function loadContacts() {
    setLoading(true);
    setPermDenied(false); // reset from any previous denial
    const { status } = await Contacts.requestPermissionsAsync();
    if (status !== 'granted') {
      setPermDenied(true);
      setLoading(false);
      return;
    }
    const { data } = await Contacts.getContactsAsync({
      fields: [Contacts.Fields.Name, Contacts.Fields.PhoneNumbers, Contacts.Fields.FirstName, Contacts.Fields.LastName],
      sort: Contacts.SortTypes.FirstName,
    });
    const raw = (data as unknown as RawContact[])
      .filter(c => (c.name || c.firstName) && c.phoneNumbers?.length)
      .sort((a, b) => displayName(a).localeCompare(displayName(b)));
    setContacts(raw);
    setLoading(false);
  }

  const filtered = query.trim()
    ? contacts.filter(c =>
        displayName(c).toLowerCase().includes(query.toLowerCase()) ||
        c.phoneNumbers?.some(p => p.number?.includes(query))
      )
    : contacts;

  function handleCall(number: string) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Linking.openURL(`tel:${stripNumber(number)}`).catch(() => {});
    onClose();
  }

  function handleSMS(number: string, body?: string) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const suffix = body?.trim() ? `?body=${encodeURIComponent(body.trim())}` : '';
    Linking.openURL(`sms:${stripNumber(number)}${suffix}`).catch(() => {});
    onClose();
  }

  function handleJarvisCompose(contact: PickedContact) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onJarvisCompose(contact);
    onClose();
  }

  const top = Platform.OS === 'ios' ? insets.top : 24;
  const bottom = Platform.OS === 'ios' ? insets.bottom : 20;

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onClose}>
      <View style={[styles.root, { paddingTop: top }]}>

        {/* ── Header ── */}
        <View style={styles.header}>
          <Pressable onPress={onClose} style={styles.backBtn}>
            <Feather name="chevron-down" size={22} color="#0099FF" />
          </Pressable>
          <View style={{ alignItems: 'center' }}>
            <Text style={styles.title}>CONTACTS</Text>
            <Text style={styles.sub}>
              {loading ? 'Chargement…' : `${contacts.length} enregistré${contacts.length !== 1 ? 's' : ''} · JARVIS ACCESS`}
            </Text>
          </View>
          <View style={{ width: 36 }} />
        </View>

        {/* ── Search ── */}
        <View style={styles.searchRow}>
          <Feather name="search" size={14} color="#2E4E6A" style={{ marginRight: 8 }} />
          <TextInput
            ref={searchRef}
            value={query}
            onChangeText={t => { setQuery(t); setSelected(null); }}
            placeholder="Rechercher un contact..."
            placeholderTextColor="#2E4E6A"
            style={styles.searchInput}
            returnKeyType="search"
          />
          {query.length > 0 && (
            <Pressable onPress={() => { setQuery(''); setSelected(null); }}>
              <Feather name="x-circle" size={14} color="#2E4E6A" />
            </Pressable>
          )}
        </View>

        {/* ── Permission denied ── */}
        {permDenied && (
          <View style={styles.center}>
            <Feather name="lock" size={36} color="#2E4E6A" />
            <Text style={styles.centerTitle}>Accès refusé</Text>
            <Text style={styles.centerSub}>Autorisez JARVIS à accéder aux contacts dans les Réglages.</Text>
            <Pressable onPress={() => Linking.openSettings()} style={styles.openSettingsBtn}>
              <Text style={styles.openSettingsTxt}>OUVRIR RÉGLAGES</Text>
            </Pressable>
          </View>
        )}

        {/* ── Loading ── */}
        {loading && !permDenied && (
          <View style={styles.center}>
            <Text style={styles.centerSub}>Chargement des contacts…</Text>
          </View>
        )}

        {/* ── Contact list ── */}
        {!loading && !permDenied && (
          <FlatList
            data={filtered}
            keyExtractor={(item, i) => item.id ?? `${i}`}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: bottom + 20 }}
            ListEmptyComponent={
              <View style={styles.center}>
                <Feather name="user-x" size={28} color="#2E4E6A" />
                <Text style={styles.centerSub}>Aucun contact trouvé</Text>
              </View>
            }
            renderItem={({ item }) => {
              const name = displayName(item);
              const firstNum = item.phoneNumbers?.[0]?.number ?? '';
              const stripped = stripNumber(firstNum);
              const isSelected = selected?.name === name && selected?.number === stripped;
              const ac = avatarColor(name);

              return (
                <View>
                  {/* Row */}
                  <Pressable
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      Keyboard.dismiss();
                      if (isSelected) {
                        setSelected(null);
                        setSmsMode(false);
                        setSmsBody('');
                      } else {
                        setSelected({ name, number: stripped });
                        setSmsMode(false);
                        setSmsBody('');
                      }
                    }}
                    style={[
                      styles.row,
                      isSelected && { backgroundColor: ac + '12', borderColor: ac + '40', borderWidth: 1 },
                    ]}
                  >
                    {/* Avatar */}
                    <View style={[styles.avatar, { backgroundColor: ac + '22', borderColor: ac + '60' }]}>
                      <Text style={[styles.avatarTxt, { color: ac }]}>{initials(name)}</Text>
                    </View>
                    {/* Info */}
                    <View style={styles.info}>
                      <Text style={styles.contactName}>{name}</Text>
                      <Text style={styles.contactNum} numberOfLines={1}>
                        {item.phoneNumbers?.map(p => p.number).slice(0, 2).join('  ·  ')}
                      </Text>
                    </View>
                    <Feather name={isSelected ? 'chevron-up' : 'chevron-right'} size={14} color={isSelected ? ac : '#2E4E6A'} />
                  </Pressable>

                  {/* ── Actions (expanded) ── */}
                  {isSelected && (
                    <View style={[styles.actions, { borderColor: ac + '30' }]}>
                      {smsMode ? (
                        /* SMS body input */
                        <View style={[styles.smsBox, { borderColor: ac + '50' }]}>
                          <Text style={[styles.smsTag, { color: ac }]}>CONTENU DU MESSAGE</Text>
                          <TextInput
                            value={smsBody}
                            onChangeText={setSmsBody}
                            placeholder="Rédige ton message..."
                            placeholderTextColor="#2E4E6A"
                            style={styles.smsInput}
                            multiline
                            autoFocus
                          />
                          <View style={styles.smsRow}>
                            <Pressable onPress={() => setSmsMode(false)} style={styles.smsCancel}>
                              <Text style={{ color: '#2E4E6A', fontSize: 10, fontFamily: 'Inter_600SemiBold', letterSpacing: 1 }}>ANNULER</Text>
                            </Pressable>
                            <Pressable
                              onPress={() => handleSMS(selected!.number, smsBody)}
                              style={[styles.smsSend, { backgroundColor: ac + '20', borderColor: ac }]}
                            >
                              <Text style={[styles.smsSendTxt, { color: ac }]}>ENVOYER ↗</Text>
                            </Pressable>
                          </View>
                        </View>
                      ) : (
                        /* 3 action buttons */
                        <View style={styles.btns}>
                          <Pressable
                            onPress={() => handleCall(selected!.number)}
                            style={[styles.btn, { backgroundColor: '#4CAF5018', borderColor: '#4CAF50' }]}
                          >
                            <Text style={[styles.btnTxt, { color: '#4CAF50' }]}>📞 APPELER</Text>
                          </Pressable>
                          <Pressable
                            onPress={() => setSmsMode(true)}
                            style={[styles.btn, { backgroundColor: '#00E0FF18', borderColor: '#00E0FF' }]}
                          >
                            <Text style={[styles.btnTxt, { color: '#00E0FF' }]}>💬 SMS</Text>
                          </Pressable>
                          <Pressable
                            onPress={() => handleJarvisCompose(selected!)}
                            style={[styles.btn, { backgroundColor: ac + '18', borderColor: ac }]}
                          >
                            <Text style={[styles.btnTxt, { color: ac }]}>✦ JARVIS</Text>
                          </Pressable>
                        </View>
                      )}
                    </View>
                  )}
                </View>
              );
            }}
          />
        )}
      </View>
    </Modal>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#04080f' },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 14, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: '#0C1C2E',
  },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 12, fontFamily: 'Inter_700Bold', letterSpacing: 2.5, color: '#0099FF' },
  sub: { fontSize: 9, fontFamily: 'Inter_400Regular', letterSpacing: 1, color: '#2E4E6A', marginTop: 2 },

  searchRow: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: 14, marginVertical: 10,
    backgroundColor: '#080F1A', borderRadius: 10,
    borderWidth: 1, borderColor: '#0C1C2E',
    paddingHorizontal: 12, paddingVertical: 9,
  },
  searchInput: { flex: 1, color: '#C0DCF4', fontSize: 14, fontFamily: 'Inter_400Regular' },

  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 10, paddingHorizontal: 10,
    marginBottom: 3, borderRadius: 10, borderWidth: 1, borderColor: 'transparent',
  },
  avatar: {
    width: 40, height: 40, borderRadius: 20, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center', marginRight: 12,
  },
  avatarTxt: { fontSize: 13, fontFamily: 'Inter_700Bold' },
  info: { flex: 1 },
  contactName: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: '#C0DCF4', marginBottom: 2 },
  contactNum: { fontSize: 11, fontFamily: 'Inter_400Regular', color: '#2E4E6A' },

  actions: {
    marginHorizontal: 4, marginBottom: 8,
    borderWidth: 1, borderRadius: 10, padding: 10, backgroundColor: '#07101C',
  },
  btns: { flexDirection: 'row', gap: 7 },
  btn: {
    flex: 1, paddingVertical: 10, borderRadius: 8, borderWidth: 1, alignItems: 'center',
  },
  btnTxt: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 0.5 },

  smsBox: { borderWidth: 1, borderRadius: 8, padding: 10, backgroundColor: '#080F1A' },
  smsTag: { fontSize: 9, fontFamily: 'Inter_700Bold', letterSpacing: 1.5, marginBottom: 6 },
  smsInput: { color: '#C0DCF4', fontSize: 13, fontFamily: 'Inter_400Regular', minHeight: 60 },
  smsRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 8 },
  smsCancel: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 6, backgroundColor: '#0C1C2E' },
  smsSend: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 6, borderWidth: 1 },
  smsSendTxt: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 0.8 },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingTop: 70 },
  centerTitle: { fontSize: 15, fontFamily: 'Inter_600SemiBold', color: '#C0DCF4' },
  centerSub: { fontSize: 12, fontFamily: 'Inter_400Regular', color: '#2E4E6A', textAlign: 'center', paddingHorizontal: 30 },
  openSettingsBtn: {
    marginTop: 8, paddingVertical: 10, paddingHorizontal: 22,
    borderRadius: 8, borderWidth: 1, borderColor: '#0099FF',
  },
  openSettingsTxt: { color: '#0099FF', fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 1.2 },
});
