(() => {
  if (!/iPhone/.test(navigator.userAgent)) return;
  const standalone = navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;
  if (!standalone) return;
  const viewport = document.querySelector('meta[name="viewport"]');
  if (viewport) viewport.content = viewport.content.replace(/viewport-fit\s*=\s*cover\b/i, 'viewport-fit=auto');
})();
