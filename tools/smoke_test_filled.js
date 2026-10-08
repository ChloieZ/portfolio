/* 分支测试（构造数据）：验证「留空降级」与「视频 file / embed 两种填法」两条渲染路径 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = process.argv[2] || '.';

function makeEl(tag) {
  return {
    tagName: String(tag).toUpperCase(), className: '', textContent: '', innerHTML: '', id: '',
    href: '', src: '', alt: '', style: {}, dataset: {}, children: [],
    appendChild(c) { this.children.push(c); return c; },
    addEventListener() {}, classList: { add() {}, remove() {} },
  };
}

function render(products, profile) {
  const registry = {};
  ['brandName','heroName','heroTitle','heroBio','heroMeta','heroHint','footerText','nav','products']
    .forEach(id => { const n = makeEl('div'); n.id = id; registry[id] = n; });
  const document = {
    title: '', readyState: 'complete', createElement: makeEl,
    getElementById: id => registry[id] || null,
    querySelectorAll: () => [], addEventListener() {},
  };
  const sandbox = {
    console, document,
    window: { PORTFOLIO: { profile: profile || {}, products } },
    Math, Array, JSON,
  };
  sandbox.window.document = document;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'assets/js/render.js'), 'utf8'), sandbox, { filename: 'render.js' });
  const all = []; (function walk(n) { all.push(n); (n.children || []).forEach(walk); })(registry.products);
  return { registry, all, byClass: c => all.filter(n => n.className === c), byTag: t => all.filter(n => n.tagName === t.toUpperCase()) };
}

let pass = 0, fail = 0;
const check = (n, c, e) => { c ? (pass++, console.log('  \u2713 ' + n)) : (fail++, console.log('  \u2717 ' + n + (e ? '  -> ' + e : ''))); };

/* ============ 场景一：什么都没填 → 应全部降级为占位 ============ */
console.log('\n[场景一：视频 / 链接都留空]');
{
  const r = render([
    { id: 'a', name: 'A', tags: [], intro: [], highlights: [], video: { type: 'none' }, link: { url: '' } },
  ]);
  check('出现「视频待补充」占位', r.byClass('video-placeholder').length === 1, String(r.byClass('video-placeholder').length));
  check('出现「体验入口待补充」按钮', r.byClass('btn is-empty').length === 1, String(r.byClass('btn is-empty').length));
  check('不产生 video / iframe', r.byTag('video').length === 0 && r.byTag('iframe').length === 0);
  check('顶部提示显示待补充数量', r.registry.heroHint.innerHTML.includes('1 个演示视频') && r.registry.heroHint.innerHTML.includes('1 个体验入口'),
    r.registry.heroHint.innerHTML.slice(0, 70));
}

/* ============ 场景二：本地文件 + 嵌入视频 两种填法 ============ */
console.log('\n[场景二：file / embed 两种视频填法 + 已填链接]');
{
  const r = render([
    {
      id: 'p-file', name: '本地视频产品', role: 'r', period: '2026', tags: ['x'], intro: ['i'], highlights: ['h'],
      video: { type: 'file', src: 'assets/video/a.mp4', poster: 'assets/img/a.jpg' },
      link: { url: 'https://example.com/a', label: '在线体验' },
    },
    {
      id: 'p-embed', name: '嵌入视频产品', tags: [], intro: [], highlights: [],
      video: { type: 'embed', src: 'https://player.bilibili.com/player.html?bvid=BV1xx' },
      link: { url: 'https://example.com/b', label: '下载体验' },
    },
  ], { name: '张三', title: 'AI 产品经理', bio: 'bio', email: 'a@b.com', github: 'https://g.com' });

  check('本地视频渲染 <video> 并带 poster', r.byTag('video').length === 1 && r.byTag('video')[0].poster === 'assets/img/a.jpg');
  check('embed 渲染 <iframe> 指向 bilibili', r.byTag('iframe').length === 1 && r.byTag('iframe')[0].src.includes('bilibili'));
  check('无视频占位残留', r.byClass('video-placeholder').length === 0);
  check('按钮使用 label 文案', r.byClass('btn').map(a => a.textContent).join('|') === '在线体验 ↗|下载体验 ↗',
    r.byClass('btn').map(a => a.textContent).join('|'));
  check('不再出现「待补充」提示', r.registry.heroHint.style.display === 'none');
  check('头部 meta 渲染 email + github', r.registry.heroMeta.children.length === 2, String(r.registry.heroMeta.children.length));
}

/* ============ 场景三：任何情况下都不该出现二维码元素 ============ */
console.log('\n[场景三：二维码已彻底移除]');
{
  const r = render([{ id: 'a', name: 'A', tags: [], intro: [], highlights: [], video: { type: 'none' }, link: { url: 'https://x.com' } }]);
  const classes = r.all.map(n => n.className).join(' ');
  check('无 img 元素', r.byTag('img').length === 0);
  check('无 qr-* class', !/qr-/.test(classes), classes);
}

console.log('\n================  ' + pass + ' 通过 / ' + fail + ' 失败  ================');
process.exit(fail ? 1 : 0);
