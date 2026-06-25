/**
 * ContactsPicker — Expo Go compatible version
 *
 * Expo Go does NOT ship expo-contacts@15.x native binaries for SDK 54,
 * so we implement a two-path approach:
 *   • Android: IntentLauncher ACTION_PICK to open the system contacts picker,
 *              then a manual number entry fallback.
 *   • iOS    : Linking to open contacts app, then number entry.
 *
 * Full in-app contact list (expo-contacts) will be available in the APK build.
 */

import React, { useState } from 'react';
import {
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
import * as IntentLauncher from 'expo-intent-launcher';
import * as Haptics from 'expo-haptics';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// ── Public types ───────────────────────────────────────────────────────────────

export interface PickedContact {
  name: string;
  number: string;
}

interface ContactsPickerProps {
  visible: boolean;
  onClose: () => void;
  /** Called when user taps "JARVIS COMPOSE" → parent sends message to JARVIS */
  onJarvisCompose: (contact: PickedContact) => void;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function stripNumber(n: string) {
  return n.replace(/[^\d+]/g, '').replace(/(?!^)\+/g, '');
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ContactsPicker({ visible, onClose, onJarvisCompose }: ContactsPickerProps) {
  const insets = useSafeAreaInsets();

  const [name, setName]     = useState('');
  const [number, setNumber] = useState('');
  const [mode, setMode]     = useState<'idle' | 'sms'>('idle');
  const [smsBody, setSmsBody] = useState('');

  const top    = Platform.OS === 'ios' ? insets.top : 24;
  const bottom = Platform.OS === 'ios' ? insets.bottom : 20;

  function reset() {
    setName('');
    setNumber('');
    setMode('idle');
    setSmsBody('');
  }

  function handleClose() {
    reset();
    onClose();
  }

  const stripped  = stripNumber(number);
  const canAction = stripped.length >= 4;

  // Open system contacts app so the user can look up a number
  async function openSystemContacts() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (Platform.OS === 'android') {
      try {
        await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
          data: 'content://contacts/people',
        });
      } catch {
        Linking.openURL('content://contacts').catch(() => {});
      }
    } else {
      Linking.openURL('contacts://').catch(() => {
        Linking.openSettings();
      });
    }
  }

  function handleCall() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Linking.openURL(`tel:${stripped}`).catch(() => {});
    handleClose();
  }

  function handleSMS() {
    const suffix = smsBody.trim() ? `?body=${encodeURIComponent(smsBody.trim())}` : '';
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Linking.openURL(`sms:${stripped}${suffix}`).catch(() => {});
    handleClose();
  }

  function handleJarvis() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onJarvisCompose({ name: name.trim() || stripped, number: stripped });
    handleClose();
  }

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={handleClose}>
      <View style={[styles.root, { paddingTop: top, paddingBottom: bottom }]}>

        {/* ── Header ── */}
        <View style={styles.header}>
          <Pressable onPress={handleClose} style={styles.backBtn}>
            <Feather name="chevron-down" size={22} color="#0099FF" />
          </Pressable>
          <View style={{ alignItems: 'center' }}>
            <Text style={styles.title}>CONTACTS</Text>
            <Text style={styles.sub}>JARVIS ACCESS · APPEL / SMS</Text>
          </View>
          <View style={{ width: 36 }} />
        </View>

        <View style={styles.body}>

          {/* ── Open system contacts ── */}
          <Pressable onPress={openSystemContacts} style={styles.contactsBtn}>
            <Feather name="book-open" size={15} color="#0099FF" style={{ marginRight: 8 }} />
            <Text style={styles.contactsBtnText}>
              {Platform.OS === 'android' ? 'OUVRIR CONTACTS ANDROID' : 'OUVRIR CONTACTS iOS'}
            </Text>
          </Pressable>

          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerLabel}>ou entrer manuellement</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* ── Name input (optional) ── */}
          <View style={[styles.field, { borderColor: name ? '#0099FF40' : '#0C1C2E' }]}>
            <Text style={styles.fieldTag}>NOM (optionnel)</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Ex: Jean Dupont"
              placeholderTextColor="#2E4E6A"
              style={styles.fieldInput}
              returnKeyType="next"
            />
          </View>

          {/* ── Number input ── */}
          <View style={[styles.field, { borderColor: stripped.length >= 4 ? '#4CAF5060' : '#0C1C2E' }]}>
            <Text style={styles.fieldTag}>NUMÉRO *</Text>
            <TextInput
              value={number}
              onChangeText={setNumber}
              placeholder="+33 6 12 34 56 78"
              placeholderTextColor="#2E4E6A"
              style={styles.fieldInput}
              keyboardType="phone-pad"
              returnKeyType="done"
              onSubmitEditing={Keyboard.dismiss}
            />
          </View>

          {/* ── SMS body (when sms mode active) ── */}
          {mode === 'sms' && (
            <View style={[styles.field, { borderColor: '#00E0FF50', minHeight: 90 }]}>
              <Text style={[styles.fieldTag, { color: '#00E0FF' }]}>MESSAGE SMS</Text>
              <TextInput
                value={smsBody}
                onChangeText={setSmsBody}
                placeholder="Tape ton message..."
                placeholderTextColor="#2E4E6A"
                style={[styles.fieldInput, { minHeight: 60 }]}
                multiline
                autoFocus
              />
            </View>
          )}

          {/* ── Action buttons ── */}
          <View style={styles.actions}>
            <Pressable
              onPress={handleCall}
              disabled={!canAction}
              style={[styles.btn, {
                backgroundColor: canAction ? '#4CAF5018' : '#080F1A',
                borderColor: canAction ? '#4CAF50' : '#0C1C2E',
              }]}
            >
              <Text style={[styles.btnText, { color: canAction ? '#4CAF50' : '#2E4E6A' }]}>📞 APPELER</Text>
            </Pressable>

            {mode === 'sms' ? (
              <Pressable
                onPress={handleSMS}
                disabled={!canAction}
                style={[styles.btn, {
                  backgroundColor: canAction ? '#00E0FF18' : '#080F1A',
                  borderColor: canAction ? '#00E0FF' : '#0C1C2E',
                }]}
              >
                <Text style={[styles.btnText, { color: canAction ? '#00E0FF' : '#2E4E6A' }]}>ENVOYER ↗</Text>
              </Pressable>
            ) : (
              <Pressable
                onPress={() => setMode('sms')}
                disabled={!canAction}
                style={[styles.btn, {
                  backgroundColor: canAction ? '#00E0FF18' : '#080F1A',
                  borderColor: canAction ? '#00E0FF' : '#0C1C2E',
                }]}
              >
                <Text style={[styles.btnText, { color: canAction ? '#00E0FF' : '#2E4E6A' }]}>💬 SMS</Text>
              </Pressable>
            )}

            <Pressable
              onPress={handleJarvis}
              disabled={!canAction}
              style={[styles.btn, {
                backgroundColor: canAction ? '#C084FC18' : '#080F1A',
                borderColor: canAction ? '#C084FC' : '#0C1C2E',
              }]}
            >
              <Text style={[styles.btnText, { color: canAction ? '#C084FC' : '#2E4E6A' }]}>✦ JARVIS</Text>
            </Pressable>
          </View>

          {/* ── Hint ── */}
          <View style={styles.hint}>
            <Feather name="info" size={11} color="#2E4E6A" style={{ marginRight: 6 }} />
            <Text style={styles.hintText}>
              La liste de contacts intégrée sera disponible dans l'APK Android.
            </Text>
          </View>

        </View>
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

  body: { flex: 1, padding: 20, gap: 12 },

  contactsBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 13, borderRadius: 10,
    borderWidth: 1, borderColor: '#0099FF40', backgroundColor: '#0099FF08',
  },
  contactsBtnText: { color: '#0099FF', fontSize: 12, fontFamily: 'Inter_700Bold', letterSpacing: 1 },

  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 2 },
  dividerLine: { flex: 1, height: 1, backgroundColor: '#0C1C2E' },
  dividerLabel: { fontSize: 10, fontFamily: 'Inter_400Regular', color: '#2E4E6A' },

  field: {
    borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10,
    backgroundColor: '#080F1A',
  },
  fieldTag: { fontSize: 9, fontFamily: 'Inter_700Bold', letterSpacing: 1.5, color: '#0099FF80', marginBottom: 4 },
  fieldInput: { color: '#C0DCF4', fontSize: 14, fontFamily: 'Inter_400Regular' },

  actions: { flexDirection: 'row', gap: 8, marginTop: 4 },
  btn: {
    flex: 1, paddingVertical: 12, borderRadius: 10,
    borderWidth: 1, alignItems: 'center',
  },
  btnText: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 0.5 },

  hint: {
    flexDirection: 'row', alignItems: 'center',
    marginTop: 'auto', padding: 12,
    backgroundColor: '#080F1A', borderRadius: 8, borderWidth: 1, borderColor: '#0C1C2E',
  },
  hintText: { flex: 1, fontSize: 10, fontFamily: 'Inter_400Regular', color: '#2E4E6A', lineHeight: 15 },
});
