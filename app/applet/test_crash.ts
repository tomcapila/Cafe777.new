import http from 'http';

const urls = [
  '/api/users/admin/badges',
  '/api/badges?creator_id=1',
  '/api/feature-access',
  '/api/ambassadors/1/stamps'
];

async function run() {
  for (const url of urls) {
    try {
      const res = await fetch(`http://127.0.0.1:3000${url}`);
      console.log(`${url} -> ${res.status}`);
      const text = await res.text();
      console.log(`Length: ${text.length}`);
    } catch (e) {
      console.error(`Error on ${url}:`, e);
    }
  }
}
run();
