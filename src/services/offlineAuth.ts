import { db } from './db';
import bcrypt from 'bcryptjs';

export class OfflineAuth {
  static async register(email: string, passwordRaw: string) {
    // 1. Hash password locally
    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(passwordRaw, salt);
    
    const userId = crypto.randomUUID();
    
    // 2. Create local user record
    await db.users.add({
      id: userId,
      email,
      password_hash,
      created_at: new Date().toISOString(),
      is_synced: false
    });

    // 3. Add to sync queue
    await db.sync_queue.add({
      action_type: 'create',
      entity: 'user',
      payload: { id: userId, email, passwordRaw }, // Send raw password to backend for its own hashing, or send hash if backend supports it
      status: 'pending',
      created_at: Date.now()
    });

    // 4. Create local session
    const token = `offline_token_${crypto.randomUUID()}`;
    await db.sessions.add({
      user_id: userId,
      auth_token: token,
      is_offline_session: true
    });

    return { user: { id: userId, email }, token };
  }

  static async login(email: string, passwordRaw: string) {
    // 1. Find user locally
    const user = await db.users.where('email').equals(email).first();
    
    if (!user) {
      throw new Error('User not found locally. Please connect to the internet to log in for the first time.');
    }

    // 2. Verify password
    const isValid = await bcrypt.compare(passwordRaw, user.password_hash);
    
    if (!isValid) {
      throw new Error('Invalid credentials');
    }

    // 3. Create offline session
    const token = `offline_token_${crypto.randomUUID()}`;
    await db.sessions.add({
      user_id: user.id,
      auth_token: token,
      is_offline_session: true
    });

    return { user: { id: user.id, email: user.email }, token };
  }
}
