const Database = require('better-sqlite3');
const db = new Database('cafe777.db');
console.log("JOHN:", db.prepare("SELECT * FROM users WHERE username = 'john2'").all());
console.log("DEBORA:", db.prepare("SELECT * FROM users WHERE username = 'debora87'").all());
