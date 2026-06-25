import React, { useState } from 'react';
import {
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useColors } from '@/hooks/useColors';
import { useTasks, Task, Note, Priority } from '@/context/TasksContext';

// ── Priority config ───────────────────────────────────────────────────────────
const PRIORITY_CONFIG: Record<Priority, { label: string; color: string; dot: string }> = {
  high:   { label: 'Haute',   color: '#FF3344', dot: '🔴' },
  medium: { label: 'Moyenne', color: '#FF9900', dot: '🟡' },
  low:    { label: 'Basse',   color: '#22D45A', dot: '🟢' },
};

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}
function formatDateTime(ts: number): string {
  return new Date(ts).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

// ── Add Task Modal ────────────────────────────────────────────────────────────
function AddTaskModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const colors = useColors();
  const { addTask } = useTasks();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<Priority>('medium');
  const [hasDue, setHasDue] = useState(false);
  const [dueDate, setDueDate] = useState(new Date(Date.now() + 86400000));
  const [showPicker, setShowPicker] = useState(false);

  const reset = () => { setTitle(''); setDescription(''); setPriority('medium'); setHasDue(false); setDueDate(new Date(Date.now() + 86400000)); };

  async function handleSave() {
    if (!title.trim()) return;
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await addTask({ title: title.trim(), description: description.trim() || undefined, priority, dueDate: hasDue ? dueDate.getTime() : undefined });
    reset(); onClose();
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.modalOverlay}>
        <View style={[styles.modalSheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, { color: colors.primary }]}>Nouvelle tâche</Text>
            <Pressable onPress={onClose} hitSlop={8}><Feather name="x" size={20} color={colors.mutedForeground} /></Pressable>
          </View>

          <TextInput
            value={title} onChangeText={setTitle}
            placeholder="Titre de la tâche..." placeholderTextColor={colors.mutedForeground}
            style={[styles.textField, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
            autoFocus
          />
          <TextInput
            value={description} onChangeText={setDescription}
            placeholder="Description (optionnel)..." placeholderTextColor={colors.mutedForeground}
            style={[styles.textField, styles.textArea, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
            multiline numberOfLines={3}
          />

          {/* Priority */}
          <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Priorité</Text>
          <View style={styles.priorityRow}>
            {(['high', 'medium', 'low'] as Priority[]).map((p) => (
              <Pressable
                key={p} onPress={() => setPriority(p)}
                style={[styles.priorityBtn, { borderColor: priority === p ? PRIORITY_CONFIG[p].color : colors.border, backgroundColor: priority === p ? PRIORITY_CONFIG[p].color + '22' : colors.background }]}
              >
                <Text style={[styles.priorityBtnText, { color: priority === p ? PRIORITY_CONFIG[p].color : colors.mutedForeground }]}>
                  {PRIORITY_CONFIG[p].dot} {PRIORITY_CONFIG[p].label}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* Due date */}
          <View style={styles.switchRow}>
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground, marginBottom: 0 }]}>Rappel / Échéance</Text>
            <Switch value={hasDue} onValueChange={setHasDue} trackColor={{ true: colors.primary }} thumbColor={hasDue ? colors.accent : colors.muted} />
          </View>
          {hasDue && (
            <>
              <Pressable
                onPress={() => setShowPicker(true)}
                style={[styles.dateBtn, { backgroundColor: colors.background, borderColor: colors.primary + '50' }]}
              >
                <Feather name="calendar" size={14} color={colors.primary} />
                <Text style={{ color: colors.primary, fontFamily: 'Inter_500Medium', fontSize: 14 }}>{formatDateTime(dueDate.getTime())}</Text>
              </Pressable>
              {showPicker && (
                <DateTimePicker
                  value={dueDate} mode="datetime" display={Platform.OS === 'ios' ? 'inline' : 'default'}
                  minimumDate={new Date()}
                  onChange={(_, d) => { setShowPicker(Platform.OS === 'ios'); if (d) setDueDate(d); }}
                />
              )}
            </>
          )}

          <View style={styles.modalActions}>
            <Pressable onPress={() => { reset(); onClose(); }} style={[styles.cancelBtn, { borderColor: colors.border }]}>
              <Text style={[styles.cancelText, { color: colors.mutedForeground }]}>Annuler</Text>
            </Pressable>
            <Pressable onPress={handleSave} disabled={!title.trim()} style={[styles.saveBtn, { backgroundColor: title.trim() ? colors.primary : colors.muted }]}>
              <Text style={{ color: title.trim() ? colors.primaryForeground : colors.mutedForeground, fontFamily: 'Inter_600SemiBold', fontSize: 15 }}>Créer</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ── Add Note Modal ────────────────────────────────────────────────────────────
function AddNoteModal({ visible, onClose, existing }: { visible: boolean; onClose: () => void; existing?: Note }) {
  const colors = useColors();
  const { addNote, updateNote } = useTasks();
  const [title, setTitle] = useState(existing?.title ?? '');
  const [content, setContent] = useState(existing?.content ?? '');

  React.useEffect(() => { setTitle(existing?.title ?? ''); setContent(existing?.content ?? ''); }, [existing]);

  async function handleSave() {
    if (!content.trim()) return;
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (existing) {
      await updateNote(existing.id, { title: title.trim(), content: content.trim() });
    } else {
      await addNote({ title: title.trim() || 'Sans titre', content: content.trim() });
    }
    onClose();
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.modalOverlay}>
        <View style={[styles.modalSheet, { backgroundColor: colors.card, borderColor: colors.border, maxHeight: '80%' }]}>
          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, { color: colors.primary }]}>{existing ? 'Modifier la note' : 'Nouvelle note'}</Text>
            <Pressable onPress={onClose} hitSlop={8}><Feather name="x" size={20} color={colors.mutedForeground} /></Pressable>
          </View>
          <TextInput
            value={title} onChangeText={setTitle}
            placeholder="Titre (optionnel)..." placeholderTextColor={colors.mutedForeground}
            style={[styles.textField, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
          />
          <TextInput
            value={content} onChangeText={setContent}
            placeholder="Contenu de la note..." placeholderTextColor={colors.mutedForeground}
            style={[styles.textField, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground, height: 160, textAlignVertical: 'top' }]}
            multiline autoFocus
          />
          <View style={styles.modalActions}>
            <Pressable onPress={onClose} style={[styles.cancelBtn, { borderColor: colors.border }]}>
              <Text style={[styles.cancelText, { color: colors.mutedForeground }]}>Annuler</Text>
            </Pressable>
            <Pressable onPress={handleSave} disabled={!content.trim()} style={[styles.saveBtn, { backgroundColor: content.trim() ? colors.primary : colors.muted }]}>
              <Text style={{ color: content.trim() ? colors.primaryForeground : colors.mutedForeground, fontFamily: 'Inter_600SemiBold', fontSize: 15 }}>Sauvegarder</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ── Task Row ──────────────────────────────────────────────────────────────────
function TaskRow({ task }: { task: Task }) {
  const colors = useColors();
  const { toggleTask, deleteTask } = useTasks();
  const pc = PRIORITY_CONFIG[task.priority];
  const isOverdue = !task.done && task.dueDate && task.dueDate < Date.now();

  return (
    <Pressable
      onLongPress={() => {
        Alert.alert('Supprimer', `Supprimer "${task.title}" ?`, [
          { text: 'Annuler', style: 'cancel' },
          { text: 'Supprimer', style: 'destructive', onPress: () => deleteTask(task.id) },
        ]);
      }}
      style={[styles.taskRow, { backgroundColor: colors.card, borderColor: task.done ? colors.border : pc.color + '40' }]}
    >
      <Pressable onPress={() => toggleTask(task.id)} style={[styles.checkbox, { borderColor: task.done ? colors.mutedForeground : pc.color, backgroundColor: task.done ? colors.mutedForeground + '40' : 'transparent' }]}>
        {task.done && <Feather name="check" size={12} color={colors.foreground} />}
      </Pressable>
      <View style={{ flex: 1 }}>
        <Text style={[styles.taskTitle, { color: task.done ? colors.mutedForeground : colors.foreground, textDecorationLine: task.done ? 'line-through' : 'none' }]} numberOfLines={2}>
          {task.title}
        </Text>
        {task.description ? <Text style={[styles.taskDesc, { color: colors.mutedForeground }]} numberOfLines={1}>{task.description}</Text> : null}
        {task.dueDate ? (
          <Text style={[styles.taskDue, { color: isOverdue ? '#FF3344' : colors.mutedForeground }]}>
            ⏰ {formatDateTime(task.dueDate)}
          </Text>
        ) : null}
      </View>
      <View style={[styles.priorityBadge, { backgroundColor: pc.color + '22' }]}>
        <Text style={[styles.priorityBadgeText, { color: pc.color }]}>{pc.label}</Text>
      </View>
    </Pressable>
  );
}

// ── Note Card ─────────────────────────────────────────────────────────────────
function NoteCard({ note, onEdit }: { note: Note; onEdit: (n: Note) => void }) {
  const colors = useColors();
  const { deleteNote } = useTasks();

  return (
    <Pressable
      onPress={() => onEdit(note)}
      onLongPress={() => {
        Alert.alert('Supprimer', `Supprimer "${note.title}" ?`, [
          { text: 'Annuler', style: 'cancel' },
          { text: 'Supprimer', style: 'destructive', onPress: () => deleteNote(note.id) },
        ]);
      }}
      style={[styles.noteCard, { backgroundColor: colors.card, borderColor: colors.primary + '30' }]}
    >
      <View style={[styles.noteAccent, { backgroundColor: colors.primary }]} />
      <Text style={[styles.noteTitle, { color: colors.foreground }]} numberOfLines={1}>{note.title}</Text>
      <Text style={[styles.noteContent, { color: colors.mutedForeground }]} numberOfLines={4}>{note.content}</Text>
      <Text style={[styles.noteDate, { color: colors.mutedForeground + '88' }]}>{formatDate(note.updatedAt)}</Text>
    </Pressable>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────
export default function TasksScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { tasks, notes } = useTasks();

  const [activeTab, setActiveTab] = useState<'tasks' | 'notes'>('tasks');
  const [showAddTask, setShowAddTask] = useState(false);
  const [showAddNote, setShowAddNote] = useState(false);
  const [editingNote, setEditingNote] = useState<Note | undefined>();

  const pendingTasks = tasks.filter((t) => !t.done).sort((a, b) => {
    const pOrder: Record<Priority, number> = { high: 0, medium: 1, low: 2 };
    if (pOrder[a.priority] !== pOrder[b.priority]) return pOrder[a.priority] - pOrder[b.priority];
    if (a.dueDate && b.dueDate) return a.dueDate - b.dueDate;
    if (a.dueDate) return -1; if (b.dueDate) return 1;
    return b.createdAt - a.createdAt;
  });
  const doneTasks = tasks.filter((t) => t.done);
  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const bottomPad = Platform.OS === 'web' ? 34 : insets.bottom;

  function handleAddFAB() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (activeTab === 'tasks') setShowAddTask(true);
    else setShowAddNote(true);
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 8 }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
          <Feather name="chevron-left" size={22} color={colors.primary} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.primary }]}>JARVIS — AGENDA</Text>
        <View style={{ width: 38 }} />
      </View>

      {/* Separator */}
      <View style={[styles.separator, { backgroundColor: colors.border }]}>
        <View style={[styles.separatorGlow, { backgroundColor: colors.primary }]} />
      </View>

      {/* Tabs */}
      <View style={[styles.tabBar, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        {(['tasks', 'notes'] as const).map((tab) => (
          <Pressable key={tab} onPress={() => setActiveTab(tab)} style={[styles.tab, activeTab === tab && { borderBottomColor: colors.primary }]}>
            <Feather name={tab === 'tasks' ? 'check-square' : 'file-text'} size={15} color={activeTab === tab ? colors.primary : colors.mutedForeground} />
            <Text style={[styles.tabText, { color: activeTab === tab ? colors.primary : colors.mutedForeground }]}>
              {tab === 'tasks' ? `Tâches${tasks.length > 0 ? ` (${tasks.length})` : ''}` : `Notes${notes.length > 0 ? ` (${notes.length})` : ''}`}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Content */}
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 14, paddingBottom: bottomPad + 80 }} showsVerticalScrollIndicator={false}>
        {activeTab === 'tasks' ? (
          <>
            {pendingTasks.length === 0 && doneTasks.length === 0 && (
              <View style={styles.emptyState}>
                <Feather name="check-square" size={40} color={colors.border} />
                <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>Aucune tâche — appuie sur + pour commencer</Text>
              </View>
            )}
            {pendingTasks.map((t) => <TaskRow key={t.id} task={t} />)}
            {doneTasks.length > 0 && (
              <>
                <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>✅ TERMINÉES ({doneTasks.length})</Text>
                {doneTasks.slice(0, 5).map((t) => <TaskRow key={t.id} task={t} />)}
              </>
            )}
          </>
        ) : (
          <>
            {notes.length === 0 && (
              <View style={styles.emptyState}>
                <Feather name="file-text" size={40} color={colors.border} />
                <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>Aucune note — appuie sur + pour commencer</Text>
              </View>
            )}
            <View style={styles.notesGrid}>
              {notes.map((n) => <NoteCard key={n.id} note={n} onEdit={(note) => { setEditingNote(note); setShowAddNote(true); }} />)}
            </View>
          </>
        )}
      </ScrollView>

      {/* FAB */}
      <Pressable
        onPress={handleAddFAB}
        style={[styles.fab, { backgroundColor: colors.primary, shadowColor: colors.primary, bottom: bottomPad + 20 }]}
      >
        <Feather name="plus" size={24} color={colors.primaryForeground} />
      </Pressable>

      {/* Modals */}
      <AddTaskModal visible={showAddTask} onClose={() => setShowAddTask(false)} />
      <AddNoteModal
        visible={showAddNote}
        existing={editingNote}
        onClose={() => { setShowAddNote(false); setEditingNote(undefined); }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 10 },
  backBtn: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 8 },
  headerTitle: { fontSize: 14, fontFamily: 'Inter_700Bold', fontWeight: '700', letterSpacing: 2 },

  separator: { height: 1, flexDirection: 'row', alignItems: 'center' },
  separatorGlow: { height: 1, width: 60, alignSelf: 'center' },

  tabBar: { flexDirection: 'row', borderBottomWidth: 1 },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabText: { fontSize: 13, fontFamily: 'Inter_500Medium', fontWeight: '500' },

  sectionLabel: { fontSize: 10, fontFamily: 'Inter_600SemiBold', letterSpacing: 2, marginTop: 16, marginBottom: 8 },

  taskRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 12, borderRadius: 10, borderWidth: 1, marginBottom: 8 },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  taskTitle: { fontSize: 14, fontFamily: 'Inter_500Medium', fontWeight: '500', lineHeight: 20 },
  taskDesc: { fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 2, lineHeight: 16 },
  taskDue: { fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 4 },
  priorityBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  priorityBadgeText: { fontSize: 10, fontFamily: 'Inter_600SemiBold', fontWeight: '600' },

  notesGrid: { gap: 10 },
  noteCard: { padding: 14, borderRadius: 10, borderWidth: 1, overflow: 'hidden' },
  noteAccent: { position: 'absolute', top: 0, left: 0, bottom: 0, width: 3 },
  noteTitle: { fontSize: 14, fontFamily: 'Inter_600SemiBold', fontWeight: '600', marginBottom: 6, paddingLeft: 8 },
  noteContent: { fontSize: 13, fontFamily: 'Inter_400Regular', lineHeight: 20, paddingLeft: 8 },
  noteDate: { fontSize: 10, fontFamily: 'Inter_400Regular', marginTop: 8, paddingLeft: 8 },

  emptyState: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60, gap: 16 },
  emptyText: { fontSize: 14, fontFamily: 'Inter_400Regular', textAlign: 'center', maxWidth: 240, lineHeight: 22 },

  fab: { position: 'absolute', right: 20, width: 54, height: 54, borderRadius: 14, alignItems: 'center', justifyContent: 'center', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.8, shadowRadius: 16, elevation: 10 },

  // Modals
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'flex-end' },
  modalSheet: { borderRadius: 20, borderWidth: 1, padding: 20, margin: 12, marginBottom: 24 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 16, fontFamily: 'Inter_700Bold', fontWeight: '700', letterSpacing: 0.5 },
  textField: { borderRadius: 8, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, fontFamily: 'Inter_400Regular', marginBottom: 10 },
  textArea: { height: 80, textAlignVertical: 'top' },
  fieldLabel: { fontSize: 11, fontFamily: 'Inter_600SemiBold', fontWeight: '600', letterSpacing: 1.5, marginBottom: 8 },
  priorityRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  priorityBtn: { flex: 1, paddingVertical: 8, borderRadius: 8, borderWidth: 1, alignItems: 'center' },
  priorityBtnText: { fontSize: 12, fontFamily: 'Inter_500Medium', fontWeight: '500' },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  dateBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 8, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 14 },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 8 },
  cancelBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, borderWidth: 1, alignItems: 'center' },
  cancelText: { fontSize: 15, fontFamily: 'Inter_500Medium', fontWeight: '500' },
  saveBtn: { flex: 2, paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
});
