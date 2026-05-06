import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'fs';

const serviceAccount = JSON.parse(fs.readFileSync('./firebase-service-account.json', 'utf8'));
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

async function check() {
  const users = await db.collection('users').where('username', '==', 'debora87').get();
  if (users.empty) {
    console.log('No debora87');
    return;
  }
  const uId = users.docs[0].id;
  console.log('Debora87 id:', uId);
  const followers = await db.collection('followers').where('user_id', '==', uId).get();
  console.log('Followers count:', followers.size);
  followers.docs.forEach(doc => console.log('Doc:', doc.id, doc.data()));
  
  // also check another type
  const falsyFollowers = await db.collection('followers').where('user_id', '==', Number(uId)).get();
  console.log('Number Followers count:', falsyFollowers.size);
}
check();