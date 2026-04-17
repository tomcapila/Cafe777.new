const fs = require('fs');
const path = require('path');

const file = './src/pages/Admin.tsx';
let content = fs.readFileSync(file, 'utf8');
let newContent = content.replace(/divide-white\/5/g, 'divide-inverse/5');

if (content !== newContent) {
  fs.writeFileSync(file, newContent, 'utf8');
  console.log(`Updated ${file}`);
}
