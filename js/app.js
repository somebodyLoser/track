/* ============================================================
   app.js — 初始化、hash 路由、秒级心跳
   ============================================================ */

(function (global) {
  'use strict';

  var SD = global.SD;

  var ROUTES = ['home', 'stats', 'timeline', 'settings'];
  var current = null;
  var tickFn = null;
  var lastDayKey = null;

  function parseRoute() {
    var raw = (global.location.hash || '').replace(/^#\/?/, '').trim();
    return ROUTES.indexOf(raw) >= 0 ? raw : 'home';
  }

  function setActiveTab(name) {
    var tabs = global.document.querySelectorAll('.tabbar .tab');
    Array.prototype.forEach.call(tabs, function (t) {
      var on = t.getAttribute('data-tab') === name;
      t.classList.toggle('active', on);
      t.setAttribute('aria-selected', on ? 'true' : 'false');
    });
  }

  function render() {
    var name = parseRoute();
    var view = global.document.getElementById('view');
    if (!view) return;

    if (current === name && view.childElementCount > 0) {
      // 同路由刷新：清空重绘，让数据变化立即反映
    }

    current = name;
    tickFn = null;

    // 切页面时收起还开着的面板，避免面板浮在新页面之上
    if (SD.ui && SD.ui.closeAll) SD.ui.closeAll();

    SD.ui.clear(view);
    view.className = 'view';
    // 重放进入动画
    view.style.animation = 'none';
    void view.offsetWidth;
    view.style.animation = '';

    var mod = SD.views && SD.views[name];
    if (mod && typeof mod.render === 'function') {
      var maybeTick = mod.render(view);
      if (typeof maybeTick === 'function') tickFn = maybeTick;
    }

    setActiveTab(name);
    global.scrollTo(0, 0);
    lastDayKey = SD.store.todayKey();
  }

  /* ---------------- 心跳 ---------------- */

  function beat() {
    if (global.document.visibilityState === 'hidden') return;
    if (tickFn) {
      try { tickFn(); } catch (e) { console.warn('[tick]', e); }
    }
  }

  function checkDayRollover() {
    var today = SD.store.todayKey();
    if (lastDayKey && today !== lastDayKey) {
      lastDayKey = today;
      render();
    }
  }

  /* ---------------- 启动遮罩 ---------------- */

  // 首屏渲染完才撤掉遮罩：宁可多看两百毫秒品牌图，也不要让人看到半张没数据的界面。
  // 最短展示 460ms（够看清、又不像卡住）；prefers-reduced-motion 时立刻撤。
  function hideBoot() {
    var el = global.document.getElementById('boot');
    if (!el) return;

    var reduce = global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var now = (global.performance && global.performance.now) ? global.performance.now() : 0;
    var wait = 0;
    if (!reduce) {
      wait = Math.max(0, 460 - (now - (global.__bootAt || 0)));
    }

    function done() {
      el.classList.add('is-done');
      global.setTimeout(function () {
        if (el.parentNode) el.parentNode.removeChild(el);
      }, reduce ? 0 : 340);
    }

    if (wait > 0) global.setTimeout(done, wait);
    else done();
  }

  /* ---------------- 启动 ---------------- */

  function boot() {
    SD.store.load();
    SD.store.apply();

    render();
    hideBoot();

    global.setInterval(beat, 1000);
    global.setInterval(checkDayRollover, 20000);

    global.addEventListener('hashchange', render);

    global.document.addEventListener('visibilitychange', function () {
      if (global.document.visibilityState === 'visible') {
        checkDayRollover();
        beat();
      }
    });

    // 供各视图调用的重绘入口
    SD.app = {
      rerender: render,
      route: parseRoute,
      go: function (name) {
        if (ROUTES.indexOf(name) < 0) return;
        if (parseRoute() === name) render();
        else global.location.hash = '#/' + name;
      }
    };

    // 首次进入：等待过渡结束后做一次静默自检
    if (!SD.store.selfTest()) {
      console.warn('[app] 日期口径自检存在失败项，请检查 store.js');
    }
  }

  if (global.document.readyState === 'loading') {
    global.document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

})(window);