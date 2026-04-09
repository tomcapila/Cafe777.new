
const Database = require('better-sqlite3');
const db = new Database('database.sqlite');

console.log("Posts table info:");
console.log(db.prepare("PRAGMA table_info(posts)").all());

console.log("\nRecent posts with shared_event_id:");
console.log(db.prepare("SELECT id, content, shared_event_id FROM posts WHERE shared_event_id IS NOT NULL ORDER BY id DESC LIMIT 5").all());

console.log("\nEvents table info:");
console.log(db.prepare("PRAGMA table_info(events)").all());
