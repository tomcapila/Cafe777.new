import Database from 'better-sqlite3';
const db = new Database('database.sqlite');
const ambassadors = db.prepare('SELECT * FROM ambassadors').all();
console.log(ambassadors);
