import Dexie, { Table } from 'dexie';

export interface LocalUser {
  id: string;
  email: string;
  password_hash: string;
  created_at: string;
  is_synced: boolean;
}

export interface LocalSession {
  user_id: string;
  auth_token: string;
  is_offline_session: boolean;
}

export interface LocalProfile {
  user_id: string;
  name: string;
  avatar: string;
  bio: string;
}

export interface SyncQueueItem {
  id?: number;
  action_type: 'create' | 'update' | 'delete';
  entity: 'user' | 'profile' | 'post';
  payload: any;
  status: 'pending' | 'synced' | 'failed';
  created_at: number;
}

export class OfflineDatabase extends Dexie {
  users!: Table<LocalUser, string>;
  sessions!: Table<LocalSession, string>;
  profiles!: Table<LocalProfile, string>;
  sync_queue!: Table<SyncQueueItem, number>;

  constructor() {
    super('Cafe777OfflineDB');
    this.version(1).stores({
      users: 'id, email, is_synced',
      sessions: 'user_id, auth_token',
      profiles: 'user_id',
      sync_queue: '++id, status, entity'
    });
  }
}

export const db = new OfflineDatabase();
