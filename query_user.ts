import Database from 'better-sqlite3';
import fs from 'fs';

const path1 = 'cafe777.db';
const path2 = '/tmp/cafe777.db';
const dbPath = fs.existsSync(path2) ? path2 : path1;
const db = new Database(dbPath);

const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
console.log('Tables:', tables);

const users = db.prepare("SELECT id, username FROM users").all();
console.log('Usernames:', users.map(u => u.username));

