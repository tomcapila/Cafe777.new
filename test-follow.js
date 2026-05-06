(async function() {
  try {
    const res = await fetch('http://localhost:3000/api/users/62/follow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ follower_id: 123 })
    });
    console.log('Status:', res.status);
    console.log('Response:', await res.json());
  } catch (e) {
    console.error(e);
  }
})();
