const http = require('http');

const data = JSON.stringify({ email: "test@example.com", password: "Password1!" });

const options = {
  hostname: '127.0.0.1',
  port: 3000,
  path: '/api/login',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(data)
  }
};

const req = http.request(options, (res) => {
  let chunks = '';
  res.on('data', d => chunks += d);
  res.on('end', () => console.log('Status:', res.statusCode, 'Body:', chunks));
});

req.on('error', (e) => console.error(e));
req.write(data);
req.end();
