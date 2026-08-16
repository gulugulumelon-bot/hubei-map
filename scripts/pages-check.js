// GitHub Pages 兼容性检查
const fs = require('fs');

const files = ['index.html', 'js/app-2d.js', 'js/core.js', 'js/data.js', 'css/style-2d.css'];
let issues = [];

for (const f of files) {
  const s = fs.readFileSync(f, 'utf8');
  // 绝对路径资源引用（src/href 以 / 开头）
  for (const m of s.matchAll(/(?:src|href)\s*=\s*["']\//g)) issues.push(f + ': 绝对路径 src/href');
  // fetch 绝对路径
  for (const m of s.matchAll(/fetch\(\s*["']\//g)) issues.push(f + ': fetch 绝对路径');
  // 硬编码本地地址
  for (const m of s.matchAll(/127\.0\.0\.1|localhost/g)) issues.push(f + ': 硬编码 localhost');
}
console.log(issues.length ? issues.join('\n') : 'OK: 全部为相对路径，无硬编码本地地址');

console.log('--- index.html 引用文件存在性 ---');
const refs = [...fs.readFileSync('index.html', 'utf8').matchAll(/(?:src|href)="([^"]+)"/g)]
  .map(m => m[1])
  .filter(u => !u.startsWith('data:') && !u.includes('http') && !u.startsWith('#'));
for (const r of refs) console.log((fs.existsSync(r) ? 'OK  ' : 'MISS ') + r);
