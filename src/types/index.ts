import { Database as SQLiteDB } from 'sqlite';

export interface DBTask {
  id: number;
  user: string;
  messageTs: string;
  channel: string;
  status: string;
  createdAt: string;
  completedAt?: string;
  completedBy?: string;
  stateChangedAt?: string;
  stateChangedBy?: string;
}

export interface TaskState {
  id: number;
  name: string;
  emoji: string;
  description: string;
  color: string;
  order_num: number;
  isTerminal: boolean;
  allowedTransitionsTo: string[];
}

export interface SlackChannel {
  id: string;
  name: string;
  is_member: boolean;
}

export interface SlackReaction {
  name: string;
  count: number;
}

export interface SlackMessage {
  ts: string;
  user: string;
  reactions?: SlackReaction[];
  text?: string;
}

export type DB = SQLiteDB; 