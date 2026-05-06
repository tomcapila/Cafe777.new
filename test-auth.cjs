const http = require('http');

const data = JSON.stringify({ credential: 'fake_ey_token' });
const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/auth/google',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length
  }
};

const req = http.request(options, (res) => {
  console.log('Status:', res.statusCode);
  console.log('Content-Type:', res.headers['content-type']);
  let body = '';
  res.on('data', (chunk) => body += chunk);
  res.on('end', () => console.log('Body:', body));
});

req.on('error', (e) => console.error(e));
req.write(data);
req.end();
