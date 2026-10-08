/* 冒烟测试（真实数据）：加载项目里的 products.js + render.js，校验渲染结果与磁盘文件 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = process.argv[2] || '.';

/* ---------- 极简 DOM ---------- */
function makeEl(tag) {
  return {
    tagName: String(tag).toUpperCase(), className: '', textContent: '', innerHTML: '', id: '',
    href: '', src: '', alt: '', style: {}, dataset: {}, children: [],
    appendChild(c) { this.children.push(c); return c; },
    setAttribute(k, v) { this[k] = v; },
    getAttribute(k) { return this[k]; },
    addEventListener() {}, classList: { add() {}, remove() {} },
  };
}
const registry = {};
['brandName','heroName','heroTitle','heroBio','heroMeta','heroHint','heroTitleSep','footerText','nav','products']
  .forEach(id => { const n = makeEl('div'); n.id = id; registry[id] = n; });

const document = {
  title: '', readyState: 'complete', createElement: makeEl,
  getElementById: id => registry[id] || null,
  querySelectorAll: () => [], addEventListener() {},
};

const sandbox = { console, document, window: {}, Math, Array, JSON, require };
sandbox.window.document = document;
vm.createContext(sandbox);

/* ---------- 加载真实项目文件 ---------- */
vm.runInContext(fs.readFileSync(path.join(ROOT, 'data/products.js'), 'utf8'), sandbox, { filename: 'products.js' });
const DATA = sandbox.window.PORTFOLIO;
vm.runInContext(fs.readFileSync(path.join(ROOT, 'assets/js/render.js'), 'utf8'), sandbox, { filename: 'render.js' });

/* ---------- 断言工具 ---------- */
let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  \u2713 ' + name); }
  else { fail++; console.log('  \u2717 ' + name + (extra ? '  ->  ' + extra : '')); }
}
const walk = (n, f) => { f(n); (n.children || []).forEach(c => walk(c, f)); };
const gather = r => { const o = []; walk(r, n => o.push(n)); return o; };

const products = DATA.products;
const cards = registry.products.children;
const all = gather(registry.products);
const byClass = c => all.filter(n => n.className === c);
const byTag = t => all.filter(n => n.tagName === t.toUpperCase());

console.log('\n[列表渲染]');
check('卡片数量 = 数据条数 (' + products.length + ')', cards.length === products.length, '实际 ' + cards.length);
check('卡片标题与数据一致',
  cards.map(c => { const h = gather(c).find(k => k.tagName === 'H2'); return h && h.textContent; }).join('|')
    === products.map(p => p.name).join('|'));
check('锚点 id 与数据一致且不重复',
  cards.map(c => c.id).join('|') === products.map(p => p.id).join('|')
  && new Set(cards.map(c => c.id)).size === products.length);
check('每行 2 个小标题（产品介绍 / 核心亮点）', byClass('col-title').length === products.length * 2,
  byClass('col-title').length + ' vs ' + products.length * 2);

console.log('\n[横向布局结构]');
const rowBodies = byClass('row-body');
check('每行一个 .row-body', rowBodies.length === products.length, String(rowBodies.length));
check('每行固定 3 列（介绍 / 亮点 / 视频+入口）',
  rowBodies.every(b => b.children.length === 3), rowBodies.map(b => b.children.length).join(','));
check('列顺序为 介绍 → 亮点 → 媒体',
  rowBodies.every(b => b.children.map(c => c.className).join('|') === 'col col-intro|col col-points|col col-media'),
  rowBodies[0] ? rowBodies[0].children.map(c => c.className).join('|') : '');
check('每个产品行首有 .row-head', byClass('row-head').length === products.length, String(byClass('row-head').length));
check('媒体列里视频在入口之前',
  rowBodies.every(b => {
    const media = b.children[2];
    return media.children.length === 2 && /video/.test(media.children[0].className);
  }));

console.log('\n[演示视频]');
const videos = byTag('video');
check('每个产品都渲染出 <video>', videos.length === products.length, String(videos.length));
check('video src 与数据一致', videos.map(v => v.src).join('|') === products.map(p => p.video.src).join('|'),
  videos.map(v => v.src).join('|'));
check('已无「视频待补充」占位', byClass('video-placeholder').length === 0);
check('video 带 controls 且移动端可内联播放', videos.every(v => v.controls === true && v.playsInline === true));
check('每个视频帧带自定义全屏按钮（原生控制条会藏起全屏）',
  byClass('fs-btn').length === products.length, String(byClass('fs-btn').length));

console.log('\n[视频文件存在性（磁盘校验）]');
products.forEach(p => {
  const rel = p.video.src;
  const abs = path.join(ROOT, rel);
  const exists = fs.existsSync(abs);
  const size = exists ? fs.statSync(abs).size : 0;
  check(p.name + ' 视频文件存在且非空 (' + (size / 1048576).toFixed(1) + ' MB)', exists && size > 1024,
    exists ? '大小 ' + size + ' B' : '找不到 ' + rel);
});

console.log('\n[体验入口]');
const btns = byClass('btn');
check('每个产品一个体验按钮', btns.length === products.length, String(btns.length));
check('按钮链接与数据一致', btns.map(a => a.href).join('|') === products.map(p => p.link.url).join('|'),
  btns.map(a => a.href).join('|'));
check('全部为 https 且新标签打开',
  btns.every(a => /^https:\/\//.test(a.href) && a.target === '_blank' && a.rel === 'noopener'));
check('无「体验入口待补充」', byClass('btn is-empty').length === 0);
check('每个产品一个源码入口', byClass('repo-link').length === products.length,
  String(byClass('repo-link').length));
check('源码入口不在视频帧内（不遮挡 180px 宽的画面）',
  byClass('video-frame').every(f => f.children.every(c => c.className !== 'repo-link')));

console.log('\n[二维码已移除]');
const allClasses = all.map(n => n.className).join(' ') + ' ' + gather(registry.nav).map(n => n.className).join(' ');
check('页面无任何 img 元素（二维码已去掉）', byTag('img').length === 0, String(byTag('img').length));
check('页面无二维码相关 class', !/qr-/.test(allClasses), allClasses.match(/qr-[a-z]+/g) || '');
check('数据里无 qrcode 字段', !JSON.stringify(products).includes('qrcode'));

console.log('\n[头部与导航]');
check('导航链接数 = 产品数', registry.nav.children.length === products.length, String(registry.nav.children.length));
check('导航锚点正确', registry.nav.children.map(a => a.href).join('|') === products.map(p => '#' + p.id).join('|'));
check('全部补齐后「待补充」提示隐藏', registry.heroHint.style.display === 'none',
  JSON.stringify(registry.heroHint.style.display) + ' | ' + registry.heroHint.innerHTML);
check('页脚已写入', registry.footerText.textContent.length > 0, registry.footerText.textContent);
check('姓名与职位同条显示（分隔符可见）',
  registry.heroTitleSep.hidden === false && registry.heroTitle.textContent.length > 0,
  'sep.hidden=' + registry.heroTitleSep.hidden);

console.log('\n================  ' + pass + ' 通过 / ' + fail + ' 失败  ================');
process.exit(fail ? 1 : 0);
