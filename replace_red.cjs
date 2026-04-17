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
    .replace(/bg-red-500 text-chrome/g, 'bg-red-500 text-white')
    .replace(/hover:bg-red-500 hover:text-chrome/g, 'hover:bg-red-500 hover:text-white')
    .replace(/bg-emerald-500 text-chrome/g, 'bg-emerald-500 text-white')
    .replace(/hover:bg-emerald-500 hover:text-chrome/g, 'hover:bg-emerald-500 hover:text-white')
    .replace(/bg-black text-chrome/g, 'bg-black text-white')
    .replace(/bg-black\/50 hover:bg-black\/80 rounded-full text-chrome/g, 'bg-black/50 hover:bg-black/80 rounded-full text-white')
    .replace(/bg-black\/60 backdrop-blur-md rounded-lg text-chrome/g, 'bg-black/60 backdrop-blur-md rounded-lg text-white')
    .replace(/text-chrome focus:outline-none focus:border-primary/g, 'text-white focus:outline-none focus:border-primary');
  
  if (content !== newContent) {
    fs.writeFileSync(file, newContent, 'utf8');
    console.log(`Updated ${file}`);
  }
});
