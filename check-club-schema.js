import Database from 'better-sqlite3';
const db = new Database('/tmp/cafe777.db');
const tables = ['club_memberships', 'club_roles', 'club_chapters'];
tables.forEach(table => {
  const schema = db.prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name='${table}'`).get();
  console.log(`--- ${table} ---`);
  console.log(schema ? schema.sql : 'Not found');
});
