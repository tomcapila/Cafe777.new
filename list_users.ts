import Database from 'better-sqlite3';

const db = new Database('cafe777.db');
const users = db.prepare("SELECT id, username, email FROM users").all();
console.log(JSON.stringify(users, null, 2));
