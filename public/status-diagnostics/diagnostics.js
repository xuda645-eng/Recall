const selectedCase = document.documentElement.dataset.case;
const descriptions = {
  a: 'A · 保留现有固定壳、正文内部滚动和不绘制的采样层。上一轮已在原安装内观察到模糊，作为本轮基线。',
  b: 'B · 保留固定壳，顶部换成实际绘制的独立纯色层。纯色层只到 Logo 上方，不遮住 Logo，也不改变位置或阴影。',
  c: 'C · 移除采样层和固定壳，改为文档滚动、顶部吸顶栏。Logo 的尺寸、安全区间距和阴影不变。',
  f: 'F · 仅把本静态页的 viewport-fit 从 cover 改为 auto，让浏览器决定安全框。保留 A 的布局、采样层、全部 env 安全区和 10px 间距。请同时观察上缘和状态栏是否遮挡。',
};
document.querySelector('#case-description').textContent = descriptions[selectedCase];
document.querySelector(`[data-case-link="${selectedCase}"]`).setAttribute('aria-current', 'page');
history.scrollRestoration = 'manual';

function updateDisplayReport() {
  const standalone = navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;
  document.documentElement.dataset.standalone = String(standalone);
  document.querySelector('#mode').textContent = standalone
    ? `当前：主屏幕 PWA · ${selectedCase.toUpperCase()}。正在原安装实例内对照。`
    : '当前：浏览器标签页。请从原 Recall 的“设置与数据”进入本页，不要另装图标。';
  const safe = getComputedStyle(document.querySelector('#safe-probe'));
  const logo = document.querySelector('.brand').getBoundingClientRect();
  const sampler = document.querySelector('.status-edge');
  const samplerStyle = getComputedStyle(sampler);
  const bar = document.querySelector('.bar');
  const barStyle = getComputedStyle(bar);
  const viewport = window.visualViewport;
  document.querySelector('#report').textContent = JSON.stringify({
    page: 'installed-context-20261101-r3', variant: selectedCase.toUpperCase(),
    viewportMeta: document.querySelector('meta[name="viewport"]').content,
    navigatorStandalone: navigator.standalone ?? null,
    displayModeStandalone: matchMedia('(display-mode: standalone)').matches,
    screen: [screen.width, screen.height], viewport: [innerWidth, innerHeight], dpr: devicePixelRatio,
    visualViewport: viewport ? { width: viewport.width, height: viewport.height, offsetTop: viewport.offsetTop, scale: viewport.scale } : null,
    safeArea: { top: safe.paddingTop, right: safe.paddingRight, bottom: safe.paddingBottom, left: safe.paddingLeft },
    logoTop: logo.top, logoHeight: logo.height,
    barPosition: barStyle.position,
    barTop: bar.getBoundingClientRect().top, barPaddingTop: barStyle.paddingTop,
    layoutSafeTop: getComputedStyle(document.documentElement).getPropertyValue('--safe-top').trim(),
    scrollOwner: selectedCase === 'c' ? 'document' : 'content',
    scrollTop: selectedCase === 'c' ? document.scrollingElement.scrollTop : document.querySelector('.content').scrollTop,
    sampler: { display: samplerStyle.display, height: sampler.getBoundingClientRect().height, backgroundClip: samplerStyle.backgroundClip, pointerEvents: samplerStyle.pointerEvents },
  }, null, 2);
}
document.querySelector('#refresh').addEventListener('click', updateDisplayReport);
window.addEventListener('resize', updateDisplayReport);
window.addEventListener('pageshow', updateDisplayReport);
window.visualViewport?.addEventListener('resize', updateDisplayReport);
updateDisplayReport();
