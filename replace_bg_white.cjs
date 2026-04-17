const fs = require('fs');
const path = require('path');

const file = './src/pages/AmbassadorDashboard.tsx';
let content = fs.readFileSync(file, 'utf8');
let newContent = content.replace(/bg-white/g, 'bg-chrome');

if (content !== newContent) {
  fs.writeFileSync(file, newContent, 'utf8');
  console.log(`Updated ${file}`);
}
