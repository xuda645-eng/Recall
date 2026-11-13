import { useLayoutEffect, useRef } from 'react';

export function MemoryImportFooter({ busy, confirmDisabled = false, onCancel, onConfirm }: { busy: boolean; confirmDisabled?: boolean; onCancel: () => void; onConfirm: () => void }): JSX.Element {
  const footer = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const element = footer.current;
    const content = element?.closest<HTMLElement>('.memory-content');
    if (!element || !content) return;
    const measure = () => content.style.setProperty('--import-dock-height', `${element.offsetHeight}px`);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => { observer.disconnect(); content.style.removeProperty('--import-dock-height'); };
  }, []);
  return <div className="m-import-footer m-import-confirm-dock" ref={footer}><div className="m-import-footer-actions"><button type="button" className="m-secondary" disabled={busy} onClick={onCancel}>取消</button><button type="button" className="m-primary" disabled={busy || confirmDisabled} onClick={onConfirm}>确认导入</button></div></div>;
}
