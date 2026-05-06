const fetch = require('node-fetch');

async function test() {
  const req = await fetch('http://localhost:3000/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: "test@example.com", password: "Password1!" })
  });
  console.log(req.status);
  console.log(await req.text());
}
test();
