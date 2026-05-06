import http from 'http';

http.get('http://127.0.0.1:3000/api/badges', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => console.log('badges:', res.statusCode));
});

http.get('http://127.0.0.1:3000/api/ambassadors/1/stamps', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => console.log('stamps:', res.statusCode));
});
