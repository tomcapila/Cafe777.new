const fs = require('fs');
const path = require('path');

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) {
      results = results.concat(walk(file));
    } else if (file.endsWith('.tsx') || file.endsWith('.ts')) {
      results.push(file);
    }
  });
  return results;
}

const files = walk('./src');
files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  let newContent = content
    .replace(/bg-black\/50 border border-inverse\/10 rounded-xl px-4 py-3 text-white/g, 'bg-engine border border-inverse/10 rounded-xl px-4 py-3 text-chrome')
    .replace(/bg-black\/50 border border-inverse\/10 rounded-xl px-4 py-2 text-white/g, 'bg-engine border border-inverse/10 rounded-xl px-4 py-2 text-chrome')
    .replace(/bg-black\/30/g, 'bg-engine')
    .replace(/bg-black\/50 rounded-2xl/g, 'bg-engine rounded-2xl');
  
  if (content !== newContent) {
    fs.writeFileSync(file, newContent, 'utf8');
    console.log(`Updated ${file}`);
  }
});
