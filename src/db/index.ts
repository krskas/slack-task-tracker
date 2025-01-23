import { Database } from 'sqlite3';
import { open } from 'sqlite';
import { DB, DBTask, TaskState } from '../types';

let db: DB;

export async function initDB() {
  db = await open({
    filename: process.env.SQLITE_PATH || '/data/tasks.db',
    driver: Database
  });

  await db.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user TEXT NOT NULL,
      messageTs TEXT NOT NULL,
      channel TEXT NOT NULL,
      status TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      completedAt TEXT,
      completedBy TEXT,
      stateChangedAt TEXT,
      stateChangedBy TEXT
    );

    CREATE TABLE IF NOT EXISTS task_states (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      emoji TEXT NOT NULL,
      description TEXT NOT NULL,
      color TEXT NOT NULL,
      order_num INTEGER NOT NULL,
      is_terminal BOOLEAN NOT NULL DEFAULT 0,
      allowed_transitions TEXT
    );
  `);

  // Default states configuration
  const defaultStates = [
    {
      name: 'open',
      emoji: process.env.DEFAULT_TASK_OPEN_EMOJI || 'eyes',
      description: 'Task needs attention',
      color: '#6E84F5',
      order_num: 1,
      isTerminal: false,
      transitions: 'working,finished'
    },
    {
      name: 'working',
      emoji: process.env.DEFAULT_TASK_WORKING_EMOJI || 'hammer',
      description: 'Task is being worked on',
      color: '#F5B86E',
      order_num: 2,
      isTerminal: false,
      transitions: 'open,review,finished'
    },
    {
      name: 'review',
      emoji: process.env.DEFAULT_TASK_REVIEW_EMOJI || 'mag',
      description: 'Task completed, needs review',
      color: '#F5D76E',
      order_num: 3,
      isTerminal: false,
      transitions: 'working,finished'
    },
    {
      name: 'finished',
      emoji: process.env.DEFAULT_TASK_FINISHED_EMOJI || 'white_check_mark',
      description: 'Task has been completed',
      color: '#6EF58E',
      order_num: 4,
      isTerminal: true,
      transitions: ''
    }
  ];

  for (const state of defaultStates) {
    // First try to insert if not exists
    await db.run(`
      INSERT OR IGNORE INTO task_states 
      (name, emoji, description, color, order_num, is_terminal, allowed_transitions)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [
      state.name,
      state.emoji,
      state.description,
      state.color,
      state.order_num,
      state.isTerminal ? 1 : 0,
      state.transitions
    ]);

    // Then update emoji if it changed
    await db.run(`
      UPDATE task_states 
      SET emoji = ?
      WHERE name = ?
    `, [state.emoji, state.name]);
  }

  return db;
}

export async function getDB() {
  if (!db) {
    await initDB();
  }
  return db;
}

export async function getTaskStates(): Promise<TaskState[]> {
  const db = await getDB();
  return db.all<TaskState[]>('SELECT * FROM task_states ORDER BY order_num');
}

export async function isValidStateTransition(fromState: string, toState: string): Promise<boolean> {
  const db = await getDB();
  const state = await db.get(
    'SELECT allowed_transitions FROM task_states WHERE name = ?',
    [fromState]
  );
  
  if (!state?.allowed_transitions) return false;
  return state.allowed_transitions.split(',').includes(toState);
} 