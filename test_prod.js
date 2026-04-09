import { spawn } from 'child_process';
const child = spawn('node', ['server.ts'], { 
  stdio: 'inherit', 
  env: { ...process.env, NODE_ENV: 'production' } 
});
setTimeout(() => {
  child.kill();
  process.exit(0);
}, 2000);
