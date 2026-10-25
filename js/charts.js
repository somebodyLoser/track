/* ============================================================
   charts.js — 纯 SVG 手绘图表，零依赖
   全局命名空间：window.SD.charts

   注意：颜色一律写在 style 里，不写在 presentation 属性上。
   `fill="var(--accent)"` 这类写法在 Chrome / Safari 不生效，
   必须 `style="fill:var(--accent)"`。
   ============================================================ */

(function (global) {
  'use strict';

  var doc = global.document;
  var E = function (tag, props, children) { return global.SD.ui.el(tag, props, children); };
  var esc = function (s) { return global.SD.ui.escapeHtml(s); };

  var FONT = 'font-family:inherit;';

  var gradSeq = 0;
  function nextId(prefix) { gradSeq++; return prefix + gradSeq; }

  function svgEl(tag) {
    return doc.createElementNS('http://www.w3.org/2000/svg', tag);
  }

  function wrapSVG(w, h, inner) {
    var svg = svgEl('svg');
    svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    svg.setAttribute('class', 'chart');
    svg.innerHTML = inner;
    return svg;
  }

  /* ---------------- 环形进度 ---------------- */

  function ring(opts) {
    opts = opts || {};
    var size = opts.size || 200;
    var stroke = opts.stroke || 13;
    var progress = Math.max(0, Math.min(1, opts.progress || 0));
    var r = (size - stroke) / 2;
    var c = 2 * Math.PI * r;
    var cx = size / 2;

    var svg = svgEl('svg');
    svg.setAttribute('viewBox', '0 0 ' + size + ' ' + size);
    svg.setAttribute('class', 'chart');
    svg.style.width = size + 'px';
    svg.style.height = size + 'px';
    svg.style.flex = 'none';

    var g = svgEl('g');
    g.setAttribute('transform', 'rotate(-90 ' + cx + ' ' + cx + ')');

    var track = svgEl('circle');
    track.setAttribute('cx', String(cx));
    track.setAttribute('cy', String(cx));
    track.setAttribute('r', String(r));
    track.setAttribute('fill', 'none');
    track.setAttribute('stroke-width', String(stroke));
    track.style.stroke = 'var(--fill-2)';
    g.appendChild(track);

    var arc = svgEl('circle');
    arc.setAttribute('cx', String(cx));
    arc.setAttribute('cy', String(cx));
    arc.setAttribute('r', String(r));
    arc.setAttribute('fill', 'none');
    arc.setAttribute('stroke-width', String(stroke));
    arc.setAttribute('stroke-linecap', 'round');
    arc.setAttribute('stroke-dasharray', '0 ' + c);
    arc.style.stroke = opts.color || 'var(--accent)';
    arc.style.transition = 'stroke-dasharray .9s cubic-bezier(.25,1,.5,1)';
    g.appendChild(arc);

    svg.appendChild(g);

    // 起手动画：下一帧再写入实际进度
    global.requestAnimationFrame(function () {
      global.requestAnimationFrame(function () {
        arc.setAttribute('stroke-dasharray', (c * progress) + ' ' + c);
      });
    });

    return svg;
  }

  /* ---------------- 横向条形（原因分布） ---------------- */

  var BAR_COLORS = ['var(--accent)', 'var(--purple)', 'var(--orange)', 'var(--teal)',
                    'var(--pink)', 'var(--green)', 'var(--indigo)', 'var(--yellow)'];

  function hbars(items) {
    var wrap = E('div', { class: 'hbars' });
    if (!items || !items.length) return wrap;

    var max = 0;
    items.forEach(function (it) { if (it.count > max) max = it.count; });
    if (max <= 0) max = 1;

    var total = items.reduce(function (n, it) { return n + it.count; }, 0);

    items.forEach(function (it, i) {
      var pct = Math.round((it.count / max) * 100);
      var share = total ? Math.round((it.count / total) * 100) : 0;
      var color = it.merged ? 'var(--text-3)' : BAR_COLORS[i % BAR_COLORS.length];

      var fill = E('i', { class: 'hbar-fill', style: { width: '0%', background: color } });

      wrap.appendChild(E('div', { class: 'hbar-row' }, [
        E('div', { class: 'hbar-top' }, [
          E('span', { class: 'hbar-label', text: it.label }),
          E('span', { class: 'hbar-val', text: it.count + ' 次 · ' + share + '%' })
        ]),
        E('div', { class: 'hbar-track' }, [fill])
      ]));

      global.requestAnimationFrame(function () {
        global.requestAnimationFrame(function () { fill.style.width = pct + '%'; });
      });
    });

    return wrap;
  }

  /* ---------------- 星期 × 小时 热力图 ---------------- */

  var DAY_LABELS = ['日', '一', '二', '三', '四', '五', '六'];

  function hourHeat(matrix) {
    var cell = 13, gap = 3, gutter = 26, topPad = 15;
    var cols = 24, rows = 7;
    var w = gutter + cols * cell + (cols - 1) * gap;
    var h = topPad + rows * cell + (rows - 1) * gap;

    var max = 1;
    matrix.forEach(function (row) {
      row.forEach(function (v) { if (v > max) max = v; });
    });

    var parts = [];

    [0, 6, 12, 18, 23].forEach(function (hr) {
      var x = gutter + hr * (cell + gap) + cell / 2;
      parts.push('<text x="' + x + '" y="10" text-anchor="middle" font-size="8.5" ' +
        'style="' + FONT + 'fill:var(--text-3)">' + hr + '</text>');
    });

    for (var d = 0; d < rows; d++) {
      var ry = topPad + d * (cell + gap);
      parts.push('<text x="0" y="' + (ry + cell / 2 + 3.2) + '" font-size="8.5" ' +
        'style="' + FONT + 'fill:var(--text-3)">' + DAY_LABELS[d] + '</text>');

      for (var hr2 = 0; hr2 < cols; hr2++) {
        var v = matrix[d][hr2] || 0;
        var x2 = gutter + hr2 * (cell + gap);
        var style;
        if (v === 0) {
          style = 'fill:var(--fill-2)';
        } else {
          var opacity = Math.min(1, 0.22 + (v / max) * 0.78);
          style = 'fill:var(--accent);fill-opacity:' + opacity.toFixed(2);
        }
        var title = DAY_LABELS[d] + ' ' + hr2 + ':00 · ' + v + ' 次';
        parts.push('<rect x="' + x2 + '" y="' + ry + '" width="' + cell + '" height="' + cell +
          '" rx="3" style="' + style + '"><title>' + esc(title) + '</title></rect>');
      }
    }

    return wrapSVG(w, h, parts.join(''));
  }

  /* ---------------- 折线（每次破戒前坚持时长） ---------------- */

  function line(series) {
    if (!series || !series.length) return null;

    var W = 330, H = 132;
    var pad = { t: 16, r: 10, b: 22, l: 26 };
    var iw = W - pad.l - pad.r;
    var ih = H - pad.t - pad.b;

    var maxY = 1;
    series.forEach(function (p) { if (p.days > maxY) maxY = p.days; });
    var step = maxY <= 7 ? 1 : maxY <= 30 ? 5 : maxY <= 90 ? 10 : 30;
    maxY = Math.ceil(maxY / step) * step;

    var n = series.length;
    function px(i) { return n === 1 ? pad.l + iw / 2 : pad.l + (i / (n - 1)) * iw; }
    function py(v) { return pad.t + ih - (v / maxY) * ih; }

    var parts = [];

    var gid = nextId('lg');
    parts.push('<defs><linearGradient id="' + gid + '" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0%" style="stop-color:var(--accent);stop-opacity:.26"/>' +
      '<stop offset="100%" style="stop-color:var(--accent);stop-opacity:0"/>' +
      '</linearGradient></defs>');

    // 网格线 + Y 轴刻度
    [0, 0.5, 1].forEach(function (f) {
      var y = pad.t + ih - f * ih;
      parts.push('<line x1="' + pad.l + '" y1="' + y + '" x2="' + (W - pad.r) + '" y2="' + y +
        '" stroke-width="1" style="stroke:var(--separator-soft)"/>');
      parts.push('<text x="' + (pad.l - 6) + '" y="' + (y + 3) + '" text-anchor="end" ' +
        'font-size="8.5" style="' + FONT + 'fill:var(--text-3)">' +
        Math.round(f * maxY) + '</text>');
    });

    // 面积
    var areaD = 'M ' + px(0) + ' ' + py(series[0].days);
    for (var i = 1; i < n; i++) areaD += ' L ' + px(i) + ' ' + py(series[i].days);
    areaD += ' L ' + px(n - 1) + ' ' + (pad.t + ih) + ' L ' + px(0) + ' ' + (pad.t + ih) + ' Z';
    parts.push('<path d="' + areaD + '" style="fill:url(#' + gid + ')"/>');

    // 折线
    var lineD = 'M ' + px(0) + ' ' + py(series[0].days);
    for (var j = 1; j < n; j++) lineD += ' L ' + px(j) + ' ' + py(series[j].days);
    parts.push('<path d="' + lineD + '" fill="none" stroke-width="2.2" ' +
      'stroke-linecap="round" stroke-linejoin="round" style="stroke:var(--accent)"/>');

    // 数据点
    series.forEach(function (p, k) {
      parts.push('<circle cx="' + px(k) + '" cy="' + py(p.days) + '" r="3.4" stroke-width="2" ' +
        'style="fill:var(--card);stroke:var(--accent)">' +
        '<title>' + esc(p.key + ' · 坚持 ' + p.days + ' 天') + '</title></circle>');
    });

    // 首尾日期
    var first = series[0].key.slice(5).replace('-', '/');
    var lastKey = series[n - 1].key.slice(5).replace('-', '/');
    parts.push('<text x="' + px(0) + '" y="' + (H - 6) + '" text-anchor="start" font-size="8.5" ' +
      'style="' + FONT + 'fill:var(--text-3)">' + esc(first) + '</text>');
    if (n > 1) {
      parts.push('<text x="' + px(n - 1) + '" y="' + (H - 6) + '" text-anchor="end" font-size="8.5" ' +
        'style="' + FONT + 'fill:var(--text-3)">' + esc(lastKey) + '</text>');
    }

    return wrapSVG(W, H, parts.join(''));
  }

  /* ---------------- 日历热力图 ---------------- */

  function calendar(cal) {
    if (!cal || !cal.cells || !cal.cells.length) return null;

    var cell = 9, gap = 3, step = cell + gap;
    var offset = cal.cells[0].date.getDay();
    var weeks = Math.ceil((offset + cal.cells.length) / 7);
    var W = weeks * step - gap;
    var top = 14;
    var H = top + 7 * step - gap + 4;

    var parts = [];

    // 月份刻度
    var lastMonth = -1;
    cal.cells.forEach(function (c, idx) {
      var m = c.date.getMonth();
      if (m !== lastMonth) {
        lastMonth = m;
        var col = Math.floor((offset + idx) / 7);
        if (col < weeks - 2) {
          parts.push('<text x="' + (col * step) + '" y="8" font-size="7.5" ' +
            'style="' + FONT + 'fill:var(--text-3)">' + (m + 1) + '月</text>');
        }
      }
    });

    var levelOpacity = { 1: 0.24, 2: 0.44, 3: 0.66, 4: 0.92 };

    cal.cells.forEach(function (c, idx2) {
      var col = Math.floor((offset + idx2) / 7);
      var row = (offset + idx2) % 7;
      var x = col * step;
      var y = top + row * step;

      var style;
      if (c.level === -1) {
        style = 'fill:var(--orange)';
      } else if (c.level === 0) {
        style = 'fill:var(--fill-2)';
      } else {
        style = 'fill:var(--accent);fill-opacity:' + (levelOpacity[c.level] || 0.3);
      }

      var tip = c.key + (c.level === -1 ? ' · 破戒' : c.level === 0 ? '' : ' · 连续中');
      parts.push('<rect x="' + x + '" y="' + y + '" width="' + cell + '" height="' + cell +
        '" rx="2.5" style="' + style + '"><title>' + esc(tip) + '</title></rect>');
    });

    return wrapSVG(W, H, parts.join(''));
  }

  /** 热力图图例 */
  function calendarLegend() {
    var wrap = E('div', { class: 'legend' }, [E('span', { text: '少' })]);
    [1, 2, 3, 4].forEach(function (lv) {
      var opacity = { 1: 0.24, 2: 0.44, 3: 0.66, 4: 0.92 }[lv];
      wrap.appendChild(E('i', { style: { background: 'var(--accent)', opacity: String(opacity) } }));
    });
    wrap.appendChild(E('span', { text: '多' }));
    wrap.appendChild(E('span', { text: '　' }));
    wrap.appendChild(E('i', { style: { background: 'var(--orange)' } }));
    wrap.appendChild(E('span', { text: '破戒' }));
    return wrap;
  }

  global.SD = global.SD || {};
  global.SD.charts = {
    ring: ring,
    hbars: hbars,
    hourHeat: hourHeat,
    line: line,
    calendar: calendar,
    calendarLegend: calendarLegend
  };

})(window);