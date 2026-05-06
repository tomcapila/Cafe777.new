const http = require('http');

const urls = [
  '/api/badges',
  '/api/feature-access',
  '/api/ambassadors/1/stamps'
];

async function run() {
  for (const url of urls) {
    await new Promise((resolve) => {
      console.log(`Fetching ${url}...`);
      http.get('http://127.0.0.1:3000' + url, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          console.log(`${url} -> ${res.statusCode}, len: ${data.length}`);
          resolve();
        });
      }).on('error', (err) => {
        console.error(`${url} -> ERROR:`, err.message);
        resolve();
      });
    });
  }
}
run();
