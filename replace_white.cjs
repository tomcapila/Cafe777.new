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
    .replace(/hover:bg-white/g, 'hover:bg-inverse hover:text-asphalt')
    .replace(/bg-white text-black/g, 'bg-inverse text-asphalt')
    .replace(/border-white/g, 'border-inverse')
    .replace(/shadow-white\/20/g, 'shadow-inverse/20')
    .replace(/hover:bg-white\/\[0\.02\]/g, 'hover:bg-inverse/[0.02]');
  
  if (content !== newContent) {
    fs.writeFileSync(file, newContent, 'utf8');
    console.log(`Updated ${file}`);
  }
});
