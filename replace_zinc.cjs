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
    .replace(/bg-zinc-950/g, 'bg-asphalt')
    .replace(/bg-zinc-900/g, 'bg-carbon')
    .replace(/bg-zinc-800/g, 'bg-engine')
    .replace(/bg-zinc-700/g, 'bg-engine')
    .replace(/bg-zinc-600/g, 'bg-engine')
    .replace(/text-zinc-500/g, 'text-steel')
    .replace(/text-zinc-400/g, 'text-steel')
    .replace(/text-zinc-200/g, 'text-chrome')
    .replace(/border-zinc-700/g, 'border-inverse/10')
    .replace(/text-white/g, 'text-chrome')
    .replace(/hover:text-white/g, 'hover:text-chrome');
  
  if (content !== newContent) {
    fs.writeFileSync(file, newContent, 'utf8');
    console.log(`Updated ${file}`);
  }
});
