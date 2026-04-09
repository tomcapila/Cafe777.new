const Database = require('better-sqlite3');
const fs = require('fs');
const bcrypt = require('bcryptjs');

const db = new Database('/tmp/cafe777.db');

const data = JSON.parse(fs.readFileSync('ecosystems.json', 'utf8'));

const insertUser = db.prepare(`
  INSERT INTO users (username, email, password, type, profile_picture_url, role, status, referral_code)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);

const insertEco = db.prepare(`
  INSERT INTO ecosystems (user_id, company_name, full_address, service_category, details)
  VALUES (?, ?, ?, ?, ?)
`);

db.transaction(() => {
  for (const item of data) {
    try {
      // Check if user exists
      const existing = db.prepare('SELECT id FROM users WHERE username = ? OR email = ?').get(item.username, item.email);
      if (existing) {
        console.log(`Skipping ${item.username} - already exists`);
        continue;
      }

      const hashedPassword = bcrypt.hashSync(item.password, 10);
      const profileImageUrl = `https://picsum.photos/seed/${item.username}/200/200`;
      
      const result = insertUser.run(
        item.username,
        item.email,
        hashedPassword,
        item.type,
        profileImageUrl,
        'user', // default role
        'active',
        (item.referralCode || 'LEGACY') + '_' + Math.random().toString(36).substring(2, 8).toUpperCase()
      );

      insertEco.run(
        result.lastInsertRowid,
        item.businessName,
        item.location,
        item.businessType,
        item.bio
      );
      
      console.log(`Imported ${item.username}`);
    } catch (err) {
      console.error(`Error importing ${item.username}:`, err.message);
    }
  }
})();

console.log('Import complete.');
