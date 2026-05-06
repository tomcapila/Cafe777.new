const Database = require('better-sqlite3');
const db = new Database('/tmp/cafe777.db');

try {
  const userId = 6;
  const chats = db.prepare(`
        SELECT c.*, 
               (SELECT GROUP_CONCAT(user_id) FROM chat_participants WHERE chat_id = c.id) as participantIds,
               (SELECT COUNT(*) FROM messages m WHERE m.chat_id = c.id AND m.sender_id != ? AND (cp.last_read_message_id IS NULL OR m.id > cp.last_read_message_id)) as unread_count
        FROM chats c
        JOIN chat_participants cp ON c.id = cp.chat_id
        WHERE cp.user_id = ?
        ORDER BY c.last_message_timestamp DESC, c.created_at DESC
      `).all(userId, userId);
  console.log("CHATS SUCCESS:", chats);
} catch (e) {
  console.error("CHATS ERROR:", e);
}

try {
  const user_id = 6;
  const notifs = db.prepare("SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC").all(user_id);
  console.log("NOTIFS SUCCESS:", notifs);
} catch (e) {
  console.error("NOTIFS ERROR:", e);
}
