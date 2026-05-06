
import Database from "better-sqlite3";
import admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";
import fs from "fs";
import path from "path";

const firebaseConfig = JSON.parse(fs.readFileSync("./firebase-applet-config.json", "utf-8"));

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: firebaseConfig.projectId
  });
}

const firestore = getFirestore(admin.app(), firebaseConfig.firestoreDatabaseId);
const isProd = process.env.NODE_ENV === 'production' || !!process.env.K_SERVICE;
const dbPath = isProd ? '/tmp/cafe777.db' : 'cafe777.db';
const db = new Database(dbPath);

async function migrate() {
  console.log("Starting migration to Firestore...");

  // 1. Migrate Users
  const users = db.prepare("SELECT * FROM users").all() as any[];
  console.log(`Migrating ${users.length} users...`);
  for (const user of users) {
    const userDoc = {
      ...user,
      interests: user.interests ? user.interests.split(',') : [],
      services: user.services ? user.services.split(',') : [],
      is_mock: !!user.is_mock,
      reputation: user.reputation || 0,
    };
    delete userDoc.id; // use ID as doc name
    await firestore.collection("users").doc(user.id.toString()).set(userDoc);
  }

  // 2. Migrate Posts
  const posts = db.prepare("SELECT * FROM posts").all() as any[];
  console.log(`Migrating ${posts.length} posts...`);
  for (const post of posts) {
    await firestore.collection("posts").doc(post.id.toString()).set({
      ...post,
      is_pinned: !!post.is_pinned
    });
  }

  // 3. Migrate Events
  const events = db.prepare("SELECT * FROM events").all() as any[];
  console.log(`Migrating ${events.length} events...`);
  for (const event of events) {
    await firestore.collection("events").doc(event.id.toString()).set({
      ...event,
      is_promoted: !!event.is_promoted,
      is_approved: !!event.is_approved
    });
  }

  // 4. Migrate Ecosystems
  const ecosystems = db.prepare("SELECT * FROM ecosystems").all() as any[];
  console.log(`Migrating ${ecosystems.length} ecosystems...`);
  for (const eco of ecosystems) {
    await firestore.collection("ecosystems").doc(eco.user_id.toString()).set(eco);
  }

  // 5. Migrate Keywords Config
  const keywords = db.prepare("SELECT * FROM keywords_config").all() as any[];
  console.log(`Migrating ${keywords.length} keyword configs...`);
  for (const kw of keywords) {
    await firestore.collection("keywords_config").doc(kw.id.toString()).set({
      ...kw,
      keywords: JSON.parse(kw.keywords)
    });
  }

  // 6. Migrate Settings
  const settings = db.prepare("SELECT * FROM settings").all() as any[];
  console.log(`Migrating ${settings.length} settings...`);
  for (const s of settings) {
    await firestore.collection("settings").doc(s.key).set({ value: s.value });
  }

  // Update counters
  await firestore.collection("_counters").doc("users").set({ count: users.length > 0 ? Math.max(...users.map(u => u.id)) : 0 });
  await firestore.collection("_counters").doc("posts").set({ count: posts.length > 0 ? Math.max(...posts.map(p => p.id)) : 0 });
  await firestore.collection("_counters").doc("events").set({ count: events.length > 0 ? Math.max(...events.map(e => e.id)) : 0 });

  console.log("Migration complete!");
}

migrate().catch(console.error).finally(() => process.exit());
