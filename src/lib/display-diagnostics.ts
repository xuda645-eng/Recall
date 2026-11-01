import { APP_BUILD } from '@/lib/app-build';

export function readDisplayDiagnostics() {
  const safeProbe = document.createElement('div');
  safeProbe.setAttribute('aria-hidden', 'true');
  safeProbe.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none;width:0;height:0;padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)';
  document.body.append(safeProbe);
  const safeStyle = getComputedStyle(safeProbe);
  const safeArea = { top: safeStyle.paddingTop, right: safeStyle.paddingRight, bottom: safeStyle.paddingBottom, left: safeStyle.paddingLeft };
  safeProbe.remove();
  const nodes = ['html', 'body', '#root', '.memory-app', '.memory-shell', '.memory-bar', '.m-brand', '.m-status-edge'];
  const viewport = window.visualViewport;
  return {
    version: APP_BUILD.version,
    standalone: {
      navigator: (navigator as Navigator & { standalone?: boolean }).standalone ?? null,
      displayMode: matchMedia('(display-mode: standalone)').matches,
    },
    screen: { width: screen.width, height: screen.height, dpr: devicePixelRatio },
    viewport: { width: innerWidth, height: innerHeight },
    visualViewport: viewport ? { width: viewport.width, height: viewport.height, offsetTop: viewport.offsetTop, scale: viewport.scale } : null,
    safeArea,
    statusBarStyle: document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]')?.getAttribute('content') ?? null,
    viewportMeta: document.querySelector('meta[name="viewport"]')?.getAttribute('content') ?? null,
    elements: nodes.map(selector => {
      const element = document.querySelector(selector);
      if (!element) return { selector, present: false };
      const style = getComputedStyle(element);
      const box = element.getBoundingClientRect();
      return {
        selector, present: true,
        top: box.top, left: box.left, width: box.width, height: box.height,
        position: style.position, display: style.display, background: style.backgroundColor,
        filter: style.filter, backdropFilter: style.backdropFilter, transform: style.transform,
        overflowY: style.overflowY, overscrollY: style.overscrollBehaviorY,
        standalone: element.getAttribute('data-standalone'),
      };
    }),
  };
}
