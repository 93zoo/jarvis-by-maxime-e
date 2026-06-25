import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';

// ── Types ─────────────────────────────────────────────────────────────────────

export type Priority = 'low' | 'medium' | 'high';

export interface Task {
  id: string;
  title: string;
  description?: string;
  priority: Priority;
  dueDate?: number;       // unix timestamp ms
  done: boolean;
  createdAt: number;
  notificationId?: string;
}

export interface Note {
  id: string;
  title: string;
  content: string;
  createdAt: number;
  updatedAt: number;
}

interface TasksContextType {
  tasks: Task[];
  notes: Note[];
  addTask: (t: Omit<Task, 'id' | 'createdAt' | 'done'>) => Promise<Task>;
  updateTask: (id: string, updates: Partial<Task>) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
  toggleTask: (id: string) => Promise<void>;
  addNote: (n: Omit<Note, 'id' | 'createdAt' | 'updatedAt'>) => Promise<Note>;
  updateNote: (id: string, updates: Partial<Pick<Note, 'title' | 'content'>>) => Promise<void>;
  deleteNote: (id: string) => Promise<void>;
}

// ── Notifications setup ───────────────────────────────────────────────────────

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowList: true,
  }),
});

async function requestNotifPermissions() {
  const result = await Notifications.requestPermissionsAsync();
  // API shape differs across SDK versions
  const r = result as unknown as { granted?: boolean; status?: string };
  return r.granted === true || r.status === 'granted';
}

async function scheduleTaskNotif(task: Task): Promise<string | undefined> {
  if (!task.dueDate) return undefined;
  const granted = await requestNotifPermissions().catch(() => false);
  if (!granted) return undefined;

  const triggerDate = new Date(task.dueDate);
  if (triggerDate <= new Date()) return undefined;

  try {
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: `⚡ JARVIS — Rappel`,
        body: task.title,
        sound: true,
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: triggerDate },
    });
    return id;
  } catch {
    return undefined;
  }
}

async function cancelTaskNotif(notificationId?: string) {
  if (!notificationId) return;
  try { await Notifications.cancelScheduledNotificationAsync(notificationId); } catch {}
}

// ── Storage helpers ───────────────────────────────────────────────────────────

const TASKS_KEY = '@jarvis_tasks';
const NOTES_KEY = '@jarvis_notes';

function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

async function persistTasks(tasks: Task[]) {
  await AsyncStorage.setItem(TASKS_KEY, JSON.stringify(tasks));
}
async function persistNotes(notes: Note[]) {
  await AsyncStorage.setItem(NOTES_KEY, JSON.stringify(notes));
}

// ── Context ───────────────────────────────────────────────────────────────────

const TasksContext = createContext<TasksContextType | null>(null);

export function TasksProvider({ children }: { children: React.ReactNode }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);

  // Load from storage
  useEffect(() => {
    AsyncStorage.getItem(TASKS_KEY).then((v) => { if (v) setTasks(JSON.parse(v)); }).catch(() => {});
    AsyncStorage.getItem(NOTES_KEY).then((v) => { if (v) setNotes(JSON.parse(v)); }).catch(() => {});
  }, []);

  // ── Tasks ──────────────────────────────────────────────────────────────────

  const addTask = useCallback(async (t: Omit<Task, 'id' | 'createdAt' | 'done'>): Promise<Task> => {
    const task: Task = { ...t, id: genId(), createdAt: Date.now(), done: false };
    task.notificationId = await scheduleTaskNotif(task);
    setTasks((prev) => { const next = [task, ...prev]; persistTasks(next); return next; });
    return task;
  }, []);

  const updateTask = useCallback(async (id: string, updates: Partial<Task>) => {
    setTasks((prev) => {
      const next = prev.map((t) => {
        if (t.id !== id) return t;
        const updated = { ...t, ...updates };
        // Reschedule notification if dueDate changed
        if (updates.dueDate !== undefined && updates.dueDate !== t.dueDate) {
          cancelTaskNotif(t.notificationId);
          if (updates.dueDate) {
            scheduleTaskNotif(updated).then((nid) => {
              // Always update notificationId (null clears stale IDs on failure)
              setTasks((p) => { const n = p.map((x) => x.id === id ? { ...x, notificationId: nid } : x); persistTasks(n); return n; });
            });
          } else {
            // dueDate removed — clear stale notification ID immediately
            updated.notificationId = undefined;
          }
        }
        return updated;
      });
      persistTasks(next);
      return next;
    });
  }, []);

  const deleteTask = useCallback(async (id: string) => {
    setTasks((prev) => {
      const task = prev.find((t) => t.id === id);
      cancelTaskNotif(task?.notificationId);
      const next = prev.filter((t) => t.id !== id);
      persistTasks(next);
      return next;
    });
  }, []);

  const toggleTask = useCallback(async (id: string) => {
    setTasks((prev) => {
      const next = prev.map((t) => {
        if (t.id !== id) return t;
        const updated = { ...t, done: !t.done };
        if (updated.done) {
          cancelTaskNotif(t.notificationId);
          updated.notificationId = undefined; // clear stale ID
        } else {
          scheduleTaskNotif(updated).then((nid) => {
            // Always update to prevent stale IDs
            setTasks((p) => { const n = p.map((x) => x.id === id ? { ...x, notificationId: nid } : x); persistTasks(n); return n; });
          });
        }
        return updated;
      });
      persistTasks(next);
      return next;
    });
  }, []);

  // ── Notes ──────────────────────────────────────────────────────────────────

  const addNote = useCallback(async (n: Omit<Note, 'id' | 'createdAt' | 'updatedAt'>): Promise<Note> => {
    const note: Note = { ...n, id: genId(), createdAt: Date.now(), updatedAt: Date.now() };
    setNotes((prev) => { const next = [note, ...prev]; persistNotes(next); return next; });
    return note;
  }, []);

  const updateNote = useCallback(async (id: string, updates: Partial<Pick<Note, 'title' | 'content'>>) => {
    setNotes((prev) => {
      const next = prev.map((n) => n.id === id ? { ...n, ...updates, updatedAt: Date.now() } : n);
      persistNotes(next);
      return next;
    });
  }, []);

  const deleteNote = useCallback(async (id: string) => {
    setNotes((prev) => { const next = prev.filter((n) => n.id !== id); persistNotes(next); return next; });
  }, []);

  return (
    <TasksContext.Provider value={{ tasks, notes, addTask, updateTask, deleteTask, toggleTask, addNote, updateNote, deleteNote }}>
      {children}
    </TasksContext.Provider>
  );
}

export function useTasks() {
  const ctx = useContext(TasksContext);
  if (!ctx) throw new Error('useTasks must be used inside TasksProvider');
  return ctx;
}
