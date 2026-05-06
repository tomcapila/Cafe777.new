const fetch = require('node-fetch');

(async () => {
  try {
    const response = await fetch('http://localhost:3000/api/places/advanced-search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        mode: 'near_me',
        lat: -19.9167,
        lng: -43.9345,
        radius: 5000,
        keywords: ['dealership', 'repair', 'meeting_spot']
      })
    });
    
    console.log('Status:', response.status);
    const text = await response.text();
    console.log('Response:', text.substring(0, 500));
  } catch (error) {
    console.error('Fetch error:', error);
  }
})();
