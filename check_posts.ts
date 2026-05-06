
import admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const firebaseConfig = JSON.parse(fs.readFileSync("./firebase-applet-config.json", 'utf8'));

if (!admin.apps.length) {
  let credential;
  const serviceAccountPath = path.resolve(__dirname, 'serviceAccountKey.json');
  
  if (fs.existsSync(serviceAccountPath)) {
    const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
    credential = admin.credential.cert(serviceAccount);
  } else {
    credential = admin.credential.applicationDefault();
  }

  admin.initializeApp({
    credential,
    projectId: firebaseConfig.projectId,
    storageBucket: firebaseConfig.storageBucket
  });
}

const firestore = getFirestore(admin.app(), firebaseConfig.firestoreDatabaseId);

async function checkLatestPosts() {
  const snapshot = await firestore.collection("posts")
    .orderBy("created_at", "desc")
    .limit(5)
    .get();

  snapshot.forEach(doc => {
    console.log(`Post ID: ${doc.id}`);
    console.log(`Content: ${doc.data().content}`);
    console.log(`Image URL: ${doc.data().image_url}`);
    console.log(`Created At: ${doc.data().created_at}`);
    console.log('---');
  });
}

checkLatestPosts().catch(console.error);
