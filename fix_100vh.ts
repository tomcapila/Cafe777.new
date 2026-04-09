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
  if (content.includes('100vh-4rem')) {
    content = content.replace(/100vh-4rem/g, '100dvh-5rem');
    modified = true;
  }
  if (content.includes('100vh-5rem')) {
    content = content.replace(/100vh-5rem/g, '100dvh-5rem');
    modified = true;
  }
  if (modified) {
    fs.writeFileSync(file, content, 'utf8');
    console.log(`Fixed ${file}`);
  }
});
