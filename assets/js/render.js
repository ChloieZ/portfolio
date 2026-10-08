/* ============================================================
   渲染逻辑 —— 读 window.PORTFOLIO，生成横向紧凑列表
   一般不需要改这个文件，内容都在 data/products.js
   ============================================================ */
(function () {
  'use strict';

  var DATA = window.PORTFOLIO || {};
  var profile = DATA.profile || {};
  var products = Array.isArray(DATA.products) ? DATA.products : [];

  /* ---------- 小工具 ---------- */
  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function isFilled(v) {
    return typeof v === 'string' && v.trim() !== '';
  }

  function pad2(n) {
    return (n < 10 ? '0' : '') + n;
  }

  /* ---------- 顶部信息（压缩成一条） ---------- */
  function renderProfile() {
    var sep = document.getElementById('heroTitleSep');

    if (isFilled(profile.name)) {
      document.getElementById('heroName').textContent = profile.name;
      document.getElementById('brandName').textContent = profile.name + ' · 作品集';
      document.title = profile.name + ' · 产品作品集';
    }
    if (isFilled(profile.title)) {
      document.getElementById('heroTitle').textContent = profile.title;
      if (sep) sep.hidden = false;
    } else if (sep) {
      sep.hidden = true;
    }
    if (isFilled(profile.bio)) {
      document.getElementById('heroBio').textContent = profile.bio;
    }

    var meta = document.getElementById('heroMeta');
    if (isFilled(profile.email)) {
      var a = el('a', null, profile.email);
      a.href = 'mailto:' + profile.email;
      meta.appendChild(a);
    }
    if (isFilled(profile.github)) {
      var g = el('a', null, 'GitHub');
      g.href = profile.github;
      g.target = '_blank';
      g.rel = 'noopener';
      meta.appendChild(g);
    }
    if (isFilled(profile.resumeUrl)) {
      var r = el('a', null, '简历');
      r.href = profile.resumeUrl;
      r.target = '_blank';
      r.rel = 'noopener';
      meta.appendChild(r);
    }

    document.getElementById('footerText').textContent =
      (isFilled(profile.name) ? profile.name + ' · ' : '') + '产品作品集';

    // 未配置时的填写指引
    var hint = document.getElementById('heroHint');
    var missVideo = products.filter(function (p) {
      return !p.video || p.video.type === 'none' || !isFilled(p.video.src);
    }).length;
    var missLink = products.filter(function (p) {
      return !p.link || !isFilled(p.link.url);
    }).length;

    if (missVideo || missLink) {
      hint.innerHTML = '待补充：' + missVideo + ' 个演示视频、' + missLink + ' 个体验入口。' +
        '在 <code>data/products.js</code> 里填好，视频文件放进 <code>assets/video/</code> 即可，本提示会自动消失。';
    } else {
      hint.style.display = 'none';
    }
  }

  /* ---------- 导航 ---------- */
  function renderNav() {
    var nav = document.getElementById('nav');
    products.forEach(function (p) {
      if (!isFilled(p.id) || !isFilled(p.name)) return;
      var a = el('a', null, p.name);
      a.href = '#' + p.id;
      a.dataset.target = p.id;
      nav.appendChild(a);
    });
    if (!nav.children.length) nav.style.display = 'none';
  }

  /* ---------- 全屏 ---------- */
  function currentFullscreen() {
    return document.fullscreenElement || document.webkitFullscreenElement || null;
  }

  function toggleFullscreen(frame, videoEl) {
    if (currentFullscreen()) {
      var exit = document.exitFullscreen || document.webkitExitFullscreen;
      if (exit) exit.call(document);
      return;
    }
    var req = frame.requestFullscreen || frame.webkitRequestFullscreen || frame.msRequestFullscreen;
    if (req) { req.call(frame); return; }
    // iOS Safari 只允许对 video 元素本身进全屏
    if (videoEl && videoEl.webkitEnterFullscreen) videoEl.webkitEnterFullscreen();
  }

  function fullscreenButton(frame, videoEl) {
    var btn = el('button', 'fs-btn');
    btn.type = 'button';
    btn.title = '放大观看';
    btn.setAttribute('aria-label', '放大观看');
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      toggleFullscreen(frame, videoEl);
    });
    // 标题随全屏状态切换，进全屏后这个按钮就是「退出」入口
    var sync = function () {
      var on = currentFullscreen() === frame;
      btn.title = on ? '退出全屏' : '放大观看';
      btn.setAttribute('aria-label', btn.title);
    };
    ['fullscreenchange', 'webkitfullscreenchange'].forEach(function (ev) {
      document.addEventListener(ev, sync);
    });
    return btn;
  }

  /* ---------- 视频 ---------- */
  function buildVideo(video) {
    var v = video || {};

    if (v.type === 'file' && isFilled(v.src)) {
      var frame = el('div', 'video-frame');
      var videoEl = document.createElement('video');
      videoEl.controls = true;
      videoEl.preload = 'metadata';
      videoEl.playsInline = true;
      if (isFilled(v.poster)) videoEl.poster = v.poster;
      videoEl.src = v.src;
      // 视频只有 180px 宽，Chrome 会藏起原生控制条里的全屏按钮，
      // 所以自己补一个；双击画面同样是全屏（通用习惯）
      videoEl.addEventListener('dblclick', function () { toggleFullscreen(frame, videoEl); });
      frame.appendChild(videoEl);
      frame.appendChild(fullscreenButton(frame, videoEl));
      return frame;
    }

    if (v.type === 'embed' && isFilled(v.src)) {
      var frame2 = el('div', 'video-frame');
      var iframe = document.createElement('iframe');
      iframe.src = v.src;
      iframe.loading = 'lazy';
      iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture; fullscreen';
      iframe.allowFullscreen = true;
      frame2.appendChild(iframe);
      return frame2;
    }

    var ph = el('div', 'video-placeholder');
    ph.appendChild(el('div', 'vp-icon', '▶'));
    ph.appendChild(el('div', 'vp-title', '演示视频待补充'));
    ph.appendChild(el('div', 'vp-sub', 'products.js → video.src'));
    return ph;
  }

  /* ---------- 体验入口 ---------- */
  function buildEntry(product) {
    var wrap = el('div', 'entry');
    var link = product.link || {};

    if (isFilled(link.url)) {
      var a = el('a', 'btn', (link.label || '在线体验') + ' ↗');
      a.href = link.url;
      a.target = '_blank';
      a.rel = 'noopener';
      a.title = link.url;          // 完整地址放悬浮提示，不在页面上占一行
      wrap.appendChild(a);
    } else {
      var empty = el('span', 'btn is-empty', '体验入口待补充');
      empty.title = '在 data/products.js 里给该产品填 link.url';
      wrap.appendChild(empty);
    }

    // 源码仓库（可选）
    if (isFilled(product.repo)) {
      var repo = el('a', 'repo-link', '源码 ↗');
      repo.href = product.repo;
      repo.target = '_blank';
      repo.rel = 'noopener';
      repo.title = product.repo;
      wrap.appendChild(repo);
    }

    return wrap;
  }

  /* ---------- 单个产品行 ---------- */
  function buildCard(product, index) {
    var card = el('article', 'card');
    card.id = isFilled(product.id) ? product.id : 'product-' + (index + 1);

    /* --- 行首：编号 · 名称 · 一句话 · 标签 · 角色 --- */
    var head = el('div', 'row-head');
    head.appendChild(el('span', 'card-index', pad2(index + 1)));
    head.appendChild(el('h2', null, product.name || '未命名产品'));

    if (isFilled(product.tagline)) {
      var tl = el('span', 'card-tagline', product.tagline);
      tl.title = product.tagline;
      head.appendChild(tl);
    }

    if (Array.isArray(product.tags) && product.tags.length) {
      var tags = el('span', 'tags');
      product.tags.forEach(function (t) { tags.appendChild(el('span', 'tag', t)); });
      head.appendChild(tags);
    }

    var metaParts = [];
    if (isFilled(product.role)) metaParts.push(product.role);
    if (isFilled(product.period)) metaParts.push(product.period);
    if (metaParts.length) head.appendChild(el('span', 'card-role', metaParts.join(' · ')));

    card.appendChild(head);

    /* --- 行主体：三列并排 --- */
    var body = el('div', 'row-body');

    // 第一列：产品介绍
    var colIntro = el('div', 'col col-intro');
    if (Array.isArray(product.intro) && product.intro.length) {
      colIntro.appendChild(el('div', 'col-title', '产品介绍'));
      var intro = el('div', 'intro');
      product.intro.forEach(function (p) { intro.appendChild(el('p', null, p)); });
      colIntro.appendChild(intro);
    }

    // 第二列：核心亮点
    var colPoints = el('div', 'col col-points');
    if (Array.isArray(product.highlights) && product.highlights.length) {
      colPoints.appendChild(el('div', 'col-title', '核心亮点'));
      var ul = el('ul', 'highlights');
      product.highlights.forEach(function (h) { ul.appendChild(el('li', null, h)); });
      colPoints.appendChild(ul);
    }

    // 第三列：演示视频 + 体验入口
    var colMedia = el('div', 'col col-media');
    colMedia.appendChild(buildVideo(product.video));
    colMedia.appendChild(buildEntry(product));

    body.appendChild(colIntro);
    body.appendChild(colPoints);
    body.appendChild(colMedia);
    card.appendChild(body);

    return card;
  }

  /* ---------- 导航高亮 ---------- */
  function watchNav() {
    var links = [].slice.call(document.querySelectorAll('.nav a'));
    if (!links.length || !('IntersectionObserver' in window)) return;

    var map = {};
    links.forEach(function (a) { map[a.dataset.target] = a; });

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        links.forEach(function (a) { a.classList.remove('active'); });
        var active = map[entry.target.id];
        if (active) active.classList.add('active');
      });
    }, { rootMargin: '-60px 0px -70% 0px', threshold: 0 });

    products.forEach(function (p) {
      var node = p.id && document.getElementById(p.id);
      if (node) observer.observe(node);
    });
  }

  /* ---------- 启动 ---------- */
  function init() {
    renderProfile();
    renderNav();

    var list = document.getElementById('products');
    if (!products.length) {
      var empty = el('div', 'card');
      empty.appendChild(el('p', 'card-tagline', '还没有产品。打开 data/products.js，在 products 数组里添加即可。'));
      list.appendChild(empty);
    } else {
      products.forEach(function (p, i) { list.appendChild(buildCard(p, i)); });
    }

    watchNav();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
