import fs from 'fs';
import path from 'path';

function walkDir(dir: string, callback: (path: string) => void) {
  fs.readdirSync(dir).forEach(f => {
    let dirPath = path.join(dir, f);
    let isDirectory = fs.statSync(dirPath).isDirectory();
    isDirectory ? walkDir(dirPath, callback) : callback(dirPath);
  });
}

walkDir('./src', function(filePath: string) {
  if (filePath.endsWith('.tsx') || filePath.endsWith('.ts')) {
    if (filePath.includes('api.ts')) return;
    
    let content = fs.readFileSync(filePath, 'utf8');
    
    if (content.includes('fetchWithAuth') && !content.includes('import { fetchWithAuth }')) {
      const depth = filePath.split('/').length - 2;
      const relativePath = depth === 0 ? './utils/api' : '../'.repeat(depth) + 'utils/api';
      content = `import { fetchWithAuth } from '${relativePath}';\n` + content;
      fs.writeFileSync(filePath, content, 'utf8');
      console.log('Added import to ' + filePath);
    }
  }
});
