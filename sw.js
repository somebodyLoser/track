/* 自律追踪 · service worker
 *
 * 为什么需要它：iOS「添加到主屏幕」的独立 webview 缓存极其顽固，没有 SW 时
 * 文件已经在服务器上换了，手机上还是旧的。有了它，每次打开都先向服务器确认一遍，
 * push 完重开 App 就是新版，不用删图标、不用清数据。
 *
 * 策略刻意选 network-first（要的是「内容一定是新的」> 「省几百毫秒」）：
 *   1) 打开页面 → 先请求网络，带 cache: 'no-cache'（走 ETag 校验，没改就 304，不重复下载）
 *   2) 拿到新内容 → 顺手写进缓存
 *   3) 网络失败（离线 / 服务器抽风）→ 回落到上一次缓存的那份
 * 千万不要改成 cache-first：那样用户会永久卡在旧版，改完 push 也不生效。
 *
 * 发版时把 CACHE 的版本号 +1，旧缓存会在 activate 阶段被整体删掉。
 */
const CACHE = 'selfdiscipline-v1';

/* 预缓存清单：index.html 里引用的全部资源。
   加文件 / 改文件名时要同步这份清单，check-desktop.js 会校验有没有漏。 */
const ASSETS = [
  'index.html',
  'manifest.json',
  'icon.svg',
  'css/tokens.css',
  'css/base.css',
  'css/components.css',
  'css/desktop.css',
  'js/store.js',
  'js/ui.js',
  'js/charts.js',
  'js/views-home.js',
  'js/views-stats.js',
  'js/views-timeline.js',
  'js/views-settings.js',
  'js/app.js'
];

/* SW 自己就在站点根目录，scope 就是所在目录；
   用绝对 URL 当缓存 key，离线兜底时才不会因为相对/绝对路径不一致而 miss。 */
const BASE = new URL('./', self.location.href).href;
const SHELL = ASSETS.map((p) => new URL(p, BASE).href);
const INDEX = new URL('index.html', BASE).href;

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.all(SHELL.map(async (url) => {
      try {
        const res = await fetch(url, { cache: 'no-cache' });
        if (res && res.ok) await cache.put(url, res.clone());
      } catch (err) {
        /* 单个文件抓失败不影响整体安装，运行时会再补 */
      }
    }));
    await self.skipWaiting(); // 新版本立刻待命，不必等所有页面关掉
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim(); // 立刻接管已经开着的页面
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // 第三方请求一概不碰
  if (url.pathname.endsWith('/sw.js')) return;     // SW 脚本本身交给浏览器

  event.respondWith(req.mode === 'navigate' ? networkFirstDocument(req) : networkFirstAsset(req));
});

/* 导航（打开页面）→ 网络优先，失败回落到缓存里的首页 */
async function networkFirstDocument(req) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(req, { cache: 'no-cache' });
    if (res && res.ok) await cache.put(INDEX, res.clone()); // 存成 index.html，离线时任何路由都能兜住
    return res;
  } catch (err) {
    const cached = await cache.match(INDEX);
    return cached || Response.error();
  }
}

/* 静态资源（css / js / 图标）→ 同样是网络优先，离线才吃缓存 */
async function networkFirstAsset(req) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(req, { cache: 'no-cache' });
    if (res && res.ok) await cache.put(req, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(req, { ignoreSearch: true });
    return hit || Response.error();
  }
}