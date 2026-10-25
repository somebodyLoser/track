/* ============================================================
   ui.js — 极简 DOM 工具、Sheet 弹层、Toast、告警框
   全局命名空间：window.SD.ui
   ============================================================ */

(function (global) {
  'use strict';

  var doc = global.document;

  /* ---------------- DOM 构建 ---------------- */

  /**
   * el('div', {class:'card', on:{click:fn}}, [child, 'text'])
   */
  function el(tag, props, children) {
    var node = doc.createElement(tag || 'div');

    if (props) {
      Object.keys(props).forEach(function (key) {
        var v = props[key];
        if (v === null || v === undefined || v === false) return;

        if (key === 'class' || key === 'className') {
          node.className = v;
        } else if (key === 'text') {
          node.textContent = String(v);
        } else if (key === 'html') {
          node.innerHTML = v;
        } else if (key === 'style' && typeof v === 'object') {
          Object.keys(v).forEach(function (sk) { node.style.setProperty(sk, v[sk]); });
        } else if (key === 'dataset' && typeof v === 'object') {
          Object.keys(v).forEach(function (dk) { node.dataset[dk] = v[dk]; });
        } else if (key === 'on' && typeof v === 'object') {
          Object.keys(v).forEach(function (ev) { node.addEventListener(ev, v[ev]); });
        } else if (v === true) {
          node.setAttribute(key, '');
        } else {
          node.setAttribute(key, v);
        }
      });
    }

    appendAll(node, children);
    return node;
  }

  function appendAll(node, children) {
    if (children === null || children === undefined) return;
    var arr = Array.isArray(children) ? children : [children];
    arr.forEach(function (c) {
      if (c === null || c === undefined || c === false) return;
      if (Array.isArray(c)) { appendAll(node, c); return; }
      node.appendChild(typeof c === 'string' || typeof c === 'number'
        ? doc.createTextNode(String(c))
        : c);
    });
  }

  function frag(children) {
    var f = doc.createDocumentFragment();
    appendAll(f, children);
    return f;
  }

  function clear(node) {
    while (node && node.firstChild) node.removeChild(node.firstChild);
    return node;
  }

  function qs(sel, root) { return (root || doc).querySelector(sel); }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /** 把 HTML 字符串变成元素（生成内容皆由本程序构造） */
  function fromHTML(html) {
    var box = doc.createElement('div');
    box.innerHTML = html.trim();
    return box.firstElementChild;
  }

  /* ---------------- Toast ---------------- */

  function toast(message, ms) {
    var root = doc.getElementById('toast-root');
    if (!root) return;

    var node = el('div', { class: 'toast', text: message });
    root.appendChild(node);

    var life = typeof ms === 'number' ? ms : 2200;
    global.setTimeout(function () {
      node.classList.add('out');
      global.setTimeout(function () {
        if (node.parentNode) node.parentNode.removeChild(node);
      }, 300);
    }, life);
  }

  /* ---------------- 弹层基础 ---------------- */

  var openCount = 0;

  function lockScroll() {
    openCount++;
    doc.body.style.overflow = 'hidden';
  }

  function unlockScroll() {
    openCount = Math.max(0, openCount - 1);
    if (openCount === 0) doc.body.style.overflow = '';
  }

  function mountOverlay(node, extraClass) {
    var root = doc.getElementById('overlay-root');
    var overlay = el('div', { class: 'overlay' + (extraClass ? ' ' + extraClass : '') });
    var scrim = el('div', { class: 'scrim' });
    overlay.appendChild(scrim);
    overlay.appendChild(node);
    root.appendChild(overlay);
    lockScroll();

    // 下一帧再加 in，触发过渡
    global.requestAnimationFrame(function () {
      global.requestAnimationFrame(function () { overlay.classList.add('in'); });
    });

    return { overlay: overlay, scrim: scrim };
  }

  function destroyOverlay(overlay, cb) {
    overlay.classList.remove('in');
    global.setTimeout(function () {
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      unlockScroll();
      if (cb) cb();
    }, 400);
  }

  /**
   * 关掉所有已展开的面板 —— 切换页面时用。
   * 正在退场（没有 in 类）的交给各自 400ms 的定时器收尾，不重复处理。
   */
  function closeAll() {
    var overlays = doc.querySelectorAll('#overlay-root .overlay');
    for (var i = overlays.length - 1; i >= 0; i--) {
      var o = overlays[i];
      if (!o.classList.contains('in')) continue;
      o.classList.remove('in');
      if (o.parentNode) o.parentNode.removeChild(o);
      unlockScroll();
    }
  }

  /**
   * 底部 Sheet
   * opts: { title, leftText, onLeft, rightText, onRight, body(node), foot(node),
   *         dismissible(true), onClose }
   */
  function sheet(opts) {
    opts = opts || {};

    var head = el('div', { class: 'sheet-head' });

    var leftBtn = el('button', {
      class: 'sheet-side',
      type: 'button',
      text: opts.leftText || '取消',
      on: { click: function () { if (opts.onLeft) opts.onLeft(); else api.close(); } }
    });
    if (opts.leftText === null) leftBtn.style.visibility = 'hidden';

    var titleNode = el('h2', { text: opts.title || '' });

    var rightBtn = el('button', {
      class: 'sheet-side right',
      type: 'button',
      text: opts.rightText || '完成'
    });
    if (opts.rightText === null) rightBtn.style.visibility = 'hidden';
    rightBtn.addEventListener('click', function () {
      if (opts.onRight) opts.onRight();
      else api.close();
    });

    head.appendChild(leftBtn);
    head.appendChild(titleNode);
    head.appendChild(rightBtn);

    var body = el('div', { class: 'sheet-body' });
    appendAll(body, opts.body);

    var sheetNode = el('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true' });
    sheetNode.appendChild(el('div', { class: 'sheet-grab' }));
    sheetNode.appendChild(head);
    sheetNode.appendChild(body);

    if (opts.foot) {
      var foot = el('div', { class: 'sheet-foot' });
      appendAll(foot, opts.foot);
      sheetNode.appendChild(foot);
    }

    var mounted = mountOverlay(sheetNode);
    var closed = false;

    var api = {
      overlay: mounted.overlay,
      sheet: sheetNode,
      body: body,
      title: titleNode,
      rightBtn: rightBtn,
      leftBtn: leftBtn,
      close: function () {
        if (closed) return;
        closed = true;
        if (opts.onClose) opts.onClose();
        destroyOverlay(mounted.overlay);
      }
    };

    mounted.scrim.addEventListener('click', function () {
      if (opts.dismissible === false) return;
      api.close();
    });

    // 下滑关闭（简单版：只在 grab 区域拖拽）
    var grab = sheetNode.querySelector('.sheet-grab');
    if (grab && opts.dismissible !== false) {
      var startY = null;
      grab.addEventListener('touchstart', function (e) { startY = e.touches[0].clientY; }, { passive: true });
      grab.addEventListener('touchmove', function (e) {
        if (startY === null) return;
        var dy = Math.max(0, e.touches[0].clientY - startY);
        sheetNode.style.transform = 'translateY(' + dy + 'px)';
      }, { passive: true });
      grab.addEventListener('touchend', function (e) {
        var dy = startY === null ? 0 : e.changedTouches[0].clientY - startY;
        startY = null;
        sheetNode.style.transform = '';
        if (dy > 90) api.close();
      });
    }

    return api;
  }

  /**
   * 居中告警框，返回 Promise<boolean>
   * opts: { title, message, okText, cancelText, danger, hideCancel }
   */
  function confirm(opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      var settled = false;

      function finish(v) {
        if (settled) return;
        settled = true;
        resolve(v);
        destroyOverlay(mounted.overlay);
      }

      var actions = el('div', { class: 'alert-actions' });

      if (!opts.hideCancel) {
        actions.appendChild(el('button', {
          class: 'btn btn-block',
          type: 'button',
          text: opts.cancelText || '取消',
          on: { click: function () { finish(false); } }
        }));
      }

      actions.appendChild(el('button', {
        class: 'btn btn-block ' + (opts.danger ? 'btn-danger' : 'btn-primary'),
        type: 'button',
        text: opts.okText || '确定',
        on: { click: function () { finish(true); } }
      }));

      var alertNode = el('div', { class: 'alert', role: 'alertdialog' }, [
        el('h3', { text: opts.title || '确认' }),
        opts.message ? el('p', { text: opts.message }) : null,
        actions
      ]);

      var mounted = mountOverlay(alertNode, 'center');

      if (!opts.hideCancel) {
        mounted.scrim.addEventListener('click', function () { finish(false); });
      }
    });
  }

  /* ---------------- 键盘 ---------------- */

  doc.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    var overlays = doc.querySelectorAll('#overlay-root .overlay');
    if (!overlays.length) return;
    var last = overlays[overlays.length - 1];
    var scrim = last.querySelector('.scrim');
    // 交给各自的事件处理：模拟点击遮罩
    if (scrim && last.classList.contains('in')) scrim.click();
  });

  /* ---------------- 分栏 ---------------- */

  /**
   * 双栏容器。手机上按 DOM 顺序竖向堆叠，宽屏上分成两栏（见 css/desktop.css）。
   * cols: [[节点, 节点], [节点]] —— 每个子数组是宽屏上的一栏。
   * 手机上的视觉顺序 = 第 1 栏的全部内容，然后第 2 栏的全部内容。
   */
  function columns(cols) {
    var grid = el('div', { class: 'desk-grid' });
    for (var i = 0; i < cols.length; i++) {
      var items = (cols[i] || []).filter(Boolean);
      grid.appendChild(el('div', { class: 'desk-col' }, items));
    }
    return grid;
  }

  /* ---------------- 项目色点 / 作用域切换条 ---------------- */

  var COLOR_LABELS = {
    blue: '蓝', green: '绿', orange: '橙', red: '红', purple: '紫',
    pink: '粉', teal: '青', indigo: '靛', yellow: '黄'
  };

  /** 项目色点：颜色名 → 一个上色的圆点 */
  function dot(color, cls) {
    return el('span', {
      class: 'h-dot' + (cls ? ' ' + cls : ''),
      style: { background: 'var(--' + (COLOR_LABELS[color] ? color : 'blue') + ')' }
    });
  }

  /**
   * 横向滚动的范围切换条。
   * items: [{ id, label, color }]，activeId 命中项加 .on，点击回调 onPick(id)
   */
  function chipBar(items, activeId, onPick) {
    var bar = el('div', { class: 'scope-chips' });
    (items || []).forEach(function (it) {
      var b = el('button', {
        class: 'scope-chip' + (it.id === activeId ? ' on' : ''),
        type: 'button',
        on: {
          click: function () {
            if (it.id === activeId) return;
            onPick(it.id);
          }
        }
      }, [
        it.color ? dot(it.color, 'sm') : null,
        el('span', { text: it.label })
      ]);
      bar.appendChild(b);
    });
    return bar;
  }

  /* ---------------- 导出 ---------------- */

  global.SD = global.SD || {};
  global.SD.ui = {
    el: el,
    frag: frag,
    clear: clear,
    qs: qs,
    escapeHtml: escapeHtml,
    fromHTML: fromHTML,
    toast: toast,
    sheet: sheet,
    confirm: confirm,
    closeAll: closeAll,
    columns: columns,
    dot: dot,
    chipBar: chipBar,
    COLOR_LABELS: COLOR_LABELS
  };

})(window);