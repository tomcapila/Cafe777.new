fetch('http://localhost:3000/api/profile/debora87').then(res => res.json()).then(data => console.log('Profile:', JSON.stringify(data, null, 2))).catch(console.error);
