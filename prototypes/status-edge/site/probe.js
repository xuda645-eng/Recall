const root = document.documentElement;
const selectedCase = root.dataset.case;
const variants = {
  a: ['A · 现有结构', '固定外壳 + 正文内部滚动 + 不绘制的顶部采样层。作为简化基线，先确认是否复现正式版模糊。'],
  b: ['B · 独立纯色层', '保持 A 的布局，改用独立、实际绘制的顶部纯色层，且不覆盖 Logo。'],
  c: ['C · 页面吸顶栏', '移除采样层，改为文档滚动和吸顶栏。Logo 的尺寸、位置和阴影不变。'],
};
document.querySelector('#case-title').textContent = variants[selectedCase][0];
document.querySelector('#case-description').textContent = variants[selectedCase][1];
document.querySelector('#footer-case').textContent = selectedCase.toUpperCase();
document.querySelector(`[data-case-link="${selectedCase}"]`).setAttribute('aria-current', 'page');

const brand = document.querySelector('#brand');
const drawer = document.querySelector('#drawer');
const content = document.querySelector('.content');
const scrim = document.querySelector('.scrim');
const plus = document.querySelector('#plus');
const closeDrawer = document.querySelector('#close-drawer');
function setDrawer(open) {
  root.dataset.drawer = String(open);
  drawer.inert = !open;
  content.inert = open;
  plus.disabled = open;
  scrim.hidden = !open;
  brand.setAttribute('aria-expanded', String(open));
  brand.setAttribute('aria-label', open ? '关闭对照菜单' : '打开对照菜单');
  (open ? closeDrawer : brand).focus({ preventScroll: true });
}
brand.addEventListener('click', () => setDrawer(root.dataset.drawer !== 'true'));
closeDrawer.addEventListener('click', () => setDrawer(false));
scrim.addEventListener('click', () => setDrawer(false));
document.addEventListener('keydown', event => {
  if (root.dataset.drawer !== 'true') return;
  if (event.key === 'Escape') setDrawer(false);
  if (event.key === 'Tab') {
    event.preventDefault();
    (document.activeElement === closeDrawer ? brand : closeDrawer).focus({ preventScroll: true });
  }
});
plus.addEventListener('click', () => {
  document.querySelector('#mode').textContent = '加号触摸正常。这是合成对照页，不会添加任何卡片。';
});

function updateDiagnostics() {
  const mode = navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;
  root.dataset.standalone = String(mode);
  document.querySelector('#mode').textContent = mode
    ? '当前：主屏幕 PWA 模式。请观察 Logo 上缘。'
    : '当前：浏览器标签页。需另存为“Recall 顶部对照”，从主屏幕启动后再判断模糊。';
  const safe = getComputedStyle(document.querySelector('#safe-probe'));
  const viewport = window.visualViewport;
  document.querySelector('#diagnostics').textContent = JSON.stringify({
    build: 'status-edge-20261101-r1',
    variant: selectedCase.toUpperCase(),
    navigatorStandalone: navigator.standalone ?? null,
    displayModeStandalone: matchMedia('(display-mode: standalone)').matches,
    screen: [screen.width, screen.height],
    window: [innerWidth, innerHeight],
    dpr: devicePixelRatio,
    visualViewport: viewport ? { width: viewport.width, height: viewport.height, offsetTop: viewport.offsetTop, scale: viewport.scale } : null,
    safeArea: { top: safe.paddingTop, right: safe.paddingRight, bottom: safe.paddingBottom, left: safe.paddingLeft },
    logoTop: brand.getBoundingClientRect().top,
    userAgent: navigator.userAgent,
  }, null, 2);
}
updateDiagnostics();
window.addEventListener('resize', updateDiagnostics);
window.addEventListener('pageshow', updateDiagnostics);
window.visualViewport?.addEventListener('resize', updateDiagnostics);

async function prepareOffline() {
  const status = document.querySelector('#cache-status');
  if (!('serviceWorker' in navigator)) {
    status.textContent = '当前浏览器不支持测试页离线缓存。';
    return;
  }
  try {
    await navigator.serviceWorker.register('./sw.js', { scope: './' });
    await navigator.serviceWorker.ready;
    status.textContent = '测试页离线缓存已就绪。三个方案均可离线打开。';
    document.body.dataset.cacheReady = 'true';
  } catch {
    status.textContent = '测试页离线缓存未就绪，暂时不要断网测试。';
  }
}
prepareOffline();
