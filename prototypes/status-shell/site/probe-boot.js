(() => {
  const safeOrigin = /^https:\/\/([a-z0-9-]+\.)recall-memory\.pages\.dev$/.test(location.origin)
    || /^http:\/\/127\.0\.0\.1:4398$/.test(location.origin);
  if (!safeOrigin) {
    window.stop();
    throw new Error('The synthetic shell probe cannot run on the production origin.');
  }
  const nativeFetch = window.fetch.bind(window);
  window.fetch = (input, options) => {
    const url = new URL(input instanceof Request ? input.url : String(input), location.href);
    if (url.origin !== location.origin || /^\/api(?:\/|$)/.test(url.pathname)) {
      return Promise.resolve(new Response(JSON.stringify({ error: '隔离对照页禁用云同步、授权与在线导入。请勿输入任何凭证。' }), {
        status: 503, headers: { 'Content-Type': 'application/json' },
      }));
    }
    return nativeFetch(input, options);
  };
  const variant = new URLSearchParams(location.search).get('case') === 'e' ? 'e' : 'd';
  document.documentElement.dataset.shellProbe = variant;
  if (variant === 'e') {
    const style = document.createElement('style');
    style.id = 'probe-paper-surface';
    style.textContent = 'html,body,#root{background:#f6f5ef!important}';
    document.head.append(style);
  }
})();
