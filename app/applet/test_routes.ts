import http from 'http';

async function testErrors() {
  const urls = [
    '/api/badges',
    '/api/feature-access',
    '/api/ambassadors/1/stamps'
  ];

  for (const url of urls) {
    console.log(`Fetching ${url}...`);
    try {
      const resp = await fetch(`http://127.0.0.1:3000${url}`);
      console.log(`${url} -> ${resp.status}`);
      const text = await resp.text();
      console.log(`${url} text length:`, text.length);
    } catch (e: any) {
      console.error(`${url} -> ERROR:`, e.message);
    }
  }
}
testErrors();
