function updateDisplayReport() {
  const standalone = navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;
  document.documentElement.dataset.standalone = String(standalone);
  document.querySelector('#mode').textContent = standalone
    ? '当前：主屏幕 PWA。正在原安装实例内对照。'
    : '当前：浏览器标签页。请从原 Recall 的“设置与数据”进入本页，不要另装图标。';
  const safe = getComputedStyle(document.querySelector('#safe-probe'));
  const logo = document.querySelector('.brand').getBoundingClientRect();
  const viewport = window.visualViewport;
  document.querySelector('#report').textContent = JSON.stringify({
    page: 'installed-context-20261101-r1',
    navigatorStandalone: navigator.standalone ?? null,
    displayModeStandalone: matchMedia('(display-mode: standalone)').matches,
    screen: [screen.width, screen.height], viewport: [innerWidth, innerHeight], dpr: devicePixelRatio,
    visualViewport: viewport ? { width: viewport.width, height: viewport.height, offsetTop: viewport.offsetTop, scale: viewport.scale } : null,
    safeArea: { top: safe.paddingTop, right: safe.paddingRight, bottom: safe.paddingBottom, left: safe.paddingLeft },
    logoTop: logo.top, logoHeight: logo.height,
    sampler: { display: getComputedStyle(document.querySelector('.status-edge')).display, height: document.querySelector('.status-edge').getBoundingClientRect().height },
  }, null, 2);
}
document.querySelector('#refresh').addEventListener('click', updateDisplayReport);
window.addEventListener('resize', updateDisplayReport);
window.addEventListener('pageshow', updateDisplayReport);
window.visualViewport?.addEventListener('resize', updateDisplayReport);
updateDisplayReport();
