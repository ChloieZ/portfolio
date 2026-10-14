/* 把 data/products.js 迁移成 data/products.json（唯一数据源）。 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
global.window = {};
require(path.join(ROOT, 'data', 'products.js'));

const cfg = global.window.PORTFOLIO;
const out = path.join(ROOT, 'data', 'products.json');
fs.writeFileSync(out, JSON.stringify(cfg, null, 2) + '\n', 'utf8');

console.log('已生成 data/products.json');
console.log('  产品数:', cfg.products.length);
cfg.products.forEach((p, i) => {
  console.log(`   ${i + 1}. ${p.name}  video=${p.video && p.video.src}  link=${p.link && p.link.url}`);
});
console.log('  头部:', cfg.profile.name, '/', cfg.profile.title);
