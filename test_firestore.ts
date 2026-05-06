
import admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";
import fs from "fs";

const firebaseConfig = JSON.parse(fs.readFileSync("./firebase-applet-config.json", "utf-8"));

if (!admin.apps.length) {
  admin.initializeApp({
    projectId: firebaseConfig.projectId
  });
}

const firestore = getFirestore(admin.app(), firebaseConfig.firestoreDatabaseId);

async function test() {
  try {
    console.log("Testing Firestore connection...");
    const testDoc = await firestore.collection("_test").doc("ping").get();
    console.log("Doc exists:", testDoc.exists);
    await firestore.collection("_test").doc("ping").set({ time: new Date().toISOString() });
    console.log("Write successful!");
  } catch (err) {
    console.error("Test failed:", err);
  }
}

test().finally(() => process.exit());
