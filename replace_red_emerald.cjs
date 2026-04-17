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
    .replace(/bg-red-500/g, 'bg-error')
    .replace(/text-red-500/g, 'text-error')
    .replace(/text-red-400/g, 'text-error')
    .replace(/border-red-500/g, 'border-error')
    .replace(/hover:bg-red-500/g, 'hover:bg-error')
    .replace(/hover:bg-red-600/g, 'hover:bg-error')
    .replace(/hover:bg-red-400/g, 'hover:bg-error')
    .replace(/hover:text-red-500/g, 'hover:text-error')
    .replace(/hover:text-red-400/g, 'hover:text-error')
    .replace(/hover:border-red-500/g, 'hover:border-error')
    
    .replace(/bg-emerald-500/g, 'bg-success')
    .replace(/text-emerald-500/g, 'text-success')
    .replace(/text-emerald-400/g, 'text-success')
    .replace(/border-emerald-500/g, 'border-success')
    .replace(/hover:bg-emerald-500/g, 'hover:bg-success')
    .replace(/hover:bg-emerald-600/g, 'hover:bg-success')
    .replace(/hover:bg-emerald-400/g, 'hover:bg-success')
    .replace(/hover:text-emerald-500/g, 'hover:text-success')
    .replace(/hover:text-emerald-400/g, 'hover:text-success')
    .replace(/hover:border-emerald-500/g, 'hover:border-success');
  
  if (content !== newContent) {
    fs.writeFileSync(file, newContent, 'utf8');
    console.log(`Updated ${file}`);
  }
});
