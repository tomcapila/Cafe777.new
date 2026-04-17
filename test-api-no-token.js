import http from 'http';

const req = http.request({
  hostname: 'localhost',
  port: 3000,
  path: '/api/clubs/create',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  }
}, (res) => {
  console.log(`STATUS: ${res.statusCode}`);
  console.log(`HEADERS: ${JSON.stringify(res.headers)}`);
  res.setEncoding('utf8');
  res.on('data', (chunk) => {
    console.log(`BODY: ${chunk}`);
  });
});

req.on('error', (e) => {
  console.error(`problem with request: ${e.message}`);
});

req.write(JSON.stringify({
  name: 'Test Club',
  description: 'Test',
  location: 'Test'
}));
req.end();
