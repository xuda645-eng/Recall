(() => {
  const variant = document.documentElement.dataset.shellProbe;
  if (!variant) return;
  const style = document.createElement('style');
  style.textContent = '.shell-probe{font:13px/1.7 sans-serif!important;background:#fff8e9;color:#544328;border:1px solid #d2b789;border-radius:12px;padding:12px;margin:0 0 18px}.shell-probe strong{display:block}.shell-probe nav{display:flex;gap:8px;margin:8px 0}.shell-probe a{display:flex;align-items:center;justify-content:center;flex:1;min-height:44px;border:1px solid #c7b080;border-radius:8px;color:inherit;text-decoration:none}.shell-probe [aria-current=page]{background:#544328;color:white}.shell-probe summary{min-height:44px;padding:10px 0;cursor:pointer}.shell-probe pre{font:11px/1.6 monospace!important;white-space:pre-wrap;overflow-wrap:anywhere}.shell-probe p{margin:6px 0!important;font-size:12px!important}';
  document.head.append(style);
  const panel = document.createElement('section');
  panel.className = 'shell-probe';
  panel.setAttribute('aria-label', '完整壳对照说明');
  panel.innerHTML = '<strong>完整壳对照 · 不连接正式卡片</strong><nav aria-label="切换完整壳方案"><a href="/?case=d#home" data-probe-case="d">D 正式壳原样</a><a href="/?case=e#home" data-probe-case="e">E 仅统一底色</a></nav><p data-probe-mode></p><p>先看 D。若 D 模糊，再切 E。试一下滚动与 Logo 菜单。不要输入授权码、导入真实卡片或连接在线服务。</p><details><summary>诊断信息（仅本机）</summary><pre></pre></details>';
  panel.querySelector(`[data-probe-case="${variant}"]`).setAttribute('aria-current', 'page');
  function update() {
    const main = document.querySelector('.memory-content[data-route="home"] .m-main');
    if (main && panel.parentElement !== main) main.prepend(panel);
    const standalone = navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;
    panel.querySelector('[data-probe-mode]').textContent = standalone
      ? `当前：主屏幕 PWA · ${variant.toUpperCase()} · shell-20261101-r1`
      : '当前：Safari/浏览器标签页；请另存为“Recall 完整壳对照”后从主屏幕启动。';
    const logo = document.querySelector('.m-brand');
    const edge = document.querySelector('.m-status-edge');
    panel.querySelector('pre').textContent = JSON.stringify({
      build: 'shell-20261101-r1', variant, standalone,
      navigatorStandalone: navigator.standalone ?? null,
      displayModeStandalone: matchMedia('(display-mode: standalone)').matches,
      viewport: [innerWidth, innerHeight], screen: [screen.width, screen.height], dpr: devicePixelRatio,
      visualViewport: window.visualViewport ? { height: visualViewport.height, offsetTop: visualViewport.offsetTop } : null,
      rootBackground: getComputedStyle(document.documentElement).backgroundColor,
      bodyBackground: getComputedStyle(document.body).backgroundColor,
      rootOverscroll: getComputedStyle(document.body).overscrollBehaviorY,
      logoTop: logo?.getBoundingClientRect().top,
      edgeDisplay: edge ? getComputedStyle(edge).display : null,
      edgeHeight: edge?.getBoundingClientRect().height,
      userAgent: navigator.userAgent,
    }, null, 2);
  }
  const observer = new MutationObserver(() => {
    const main = document.querySelector('.memory-content[data-route="home"] .m-main');
    if (main && panel.parentElement !== main) update();
  });
  observer.observe(document.querySelector('#root'), { childList: true, subtree: true });
  window.addEventListener('resize', update);
  window.addEventListener('hashchange', () => requestAnimationFrame(update));
  panel.querySelector('details').addEventListener('toggle', update);
  update();
})();
