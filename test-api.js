import http from 'http';

const req = http.request({
  hostname: 'localhost',
  port: 3000,
  path: '/api/chats',
  method: 'GET',
  headers: {
    'Authorization': 'Bearer test'
  }
}, (res) => {
  console.log('Status:', res.statusCode);
  console.log('Headers:', res.headers);
  let data = '';
  res.on('data', (chunk) => data += chunk);
  res.on('end', () => console.log('Body:', data.substring(0, 100)));
});

req.on('error', (e) => console.error(e));
req.end();
