const { db, collections, firestore } = require("./src/lib/firebase-admin");

async function test() {
  try {
    const postSnap = await collections.posts.limit(1).get();
    if (postSnap.empty) { console.log("No posts"); return; }
    const post_id = postSnap.docs[0].id;
    console.log("Post ID:", post_id, "Type:", typeof post_id);
    
    // Fetch comments
    const commentsSnap = await collections.comments.where("post_id", "==", parseInt(post_id)).get();
    console.log("Comments count:", commentsSnap.size);
    
    // Get from SQLite
    try {
        const sq = db.prepare("SELECT * FROM post_comments WHERE post_id = ?").all(post_id);
        console.log("SQLite comments size:", sq.length);
    } catch(e) {
        console.error("SQLite error:", e);
    }
  } catch (e) {
    console.error("Tx failed:", e);
  }
}
test();
