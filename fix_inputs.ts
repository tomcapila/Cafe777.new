import * as fs from 'fs';
import * as path from 'path';

function walk(dir: string): string[] {
  let results: string[] = [];
  const list = fs.readdirSync(dir);
  list.forEach(function(file) {
    file = dir + '/' + file;
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) { 
      results = results.concat(walk(file));
    } else { 
      if (file.endsWith('.tsx')) results.push(file);
    }
  });
  return results;
}

const files = walk('./src');

files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  let modified = false;

  // Find <input ... value={...} ... />
  // and <textarea ... value={...} ... />
  
  // Regex to match value={something} where something is not a string literal and doesn't already have || or ??
  const regex = /(<(?:input|textarea|select)[\s\S]*?value=\{)([^}"'<>]+)}(\s*[\s\S]*?>)/g;
  
  content = content.replace(regex, (match, p1, p2, p3) => {
    // If it already has || or ??, leave it
    if (p2.includes('||') || p2.includes('??') || p2.includes('`') || p2.includes('?')) {
      return match;
    }
    // If it's just a variable or object property, add ?? ''
    modified = true;
    return `${p1}${p2} || ''}${p3}`;
  });

  if (modified) {
    fs.writeFileSync(file, content, 'utf8');
    console.log(`Fixed ${file}`);
  }
});
