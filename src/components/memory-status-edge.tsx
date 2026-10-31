import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

function isStandalone(): boolean {
  return matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export function MemoryStatusEdge(): JSX.Element {
  const [standalone, setStandalone] = useState(isStandalone);
  useEffect(() => {
    const mode = matchMedia('(display-mode: standalone)');
    const update = () => setStandalone(isStandalone());
    mode.addEventListener('change', update);
    return () => mode.removeEventListener('change', update);
  }, []);
  return createPortal(<div className="m-status-edge" data-standalone={standalone} aria-hidden="true"/>, document.body);
}
