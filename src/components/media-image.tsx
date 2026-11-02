import { useEffect, useRef, useState, type PointerEvent } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';
import { downloadMedia } from '@/services/media-storage';
import './media-image.css';

export function MediaImage({ id, alt }: { id: string; alt: string }): JSX.Element {
  const [src, setSrc] = useState('');
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [open, setOpen] = useState(false);
  const [transform, setTransform] = useState({ scale: 1, x: 0, y: 0 });
  const trigger = useRef<HTMLButtonElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const previous = useRef({ distance: 0, x: 0, y: 0 });
  const description = `media-description-${id}`;
  useEffect(() => {
    let cancelled = false;
    let url = '';
    setSrc(''); setError('');
    void downloadMedia(id).then(asset => {
      if (cancelled) return;
      url = URL.createObjectURL(new Blob([asset.bytes], { type: asset.mime }));
      setSrc(url);
    }).catch(failure => { if (!cancelled) setError(failure instanceof Error ? failure.message : '图片读取失败'); });
    return () => { cancelled = true; if (url) URL.revokeObjectURL(url); };
  }, [id, retry]);
  function move(event: PointerEvent<HTMLDivElement>): void {
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const points = [...pointers.current.values()];
    const center = { x: points.reduce((sum, point) => sum + point.x, 0) / points.length, y: points.reduce((sum, point) => sum + point.y, 0) / points.length };
    const distance = points.length > 1 ? Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y) : 0;
    const old = previous.current;
    setTransform(value => {
      const scale = Math.max(1, Math.min(5, old.distance && distance ? value.scale * distance / old.distance : value.scale));
      const bounds = stage.current?.getBoundingClientRect();
      const limitX = (bounds?.width ?? 0) * (scale - 1) / 2;
      const limitY = (bounds?.height ?? 0) * (scale - 1) / 2;
      return { scale, x: Math.max(-limitX, Math.min(limitX, value.x + center.x - old.x)), y: Math.max(-limitY, Math.min(limitY, value.y + center.y - old.y)) };
    });
    previous.current = { ...center, distance };
  }
  function begin(event: PointerEvent<HTMLDivElement>): void {
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const points = [...pointers.current.values()];
    previous.current = { x: points.reduce((sum, point) => sum + point.x, 0) / points.length, y: points.reduce((sum, point) => sum + point.y, 0) / points.length, distance: points.length > 1 ? Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y) : 0 };
  }
  function end(event: PointerEvent<HTMLDivElement>): void {
    pointers.current.delete(event.pointerId);
    const point = [...pointers.current.values()][0];
    previous.current = { x: point?.x ?? 0, y: point?.y ?? 0, distance: 0 };
  }
  function changeOpen(value: boolean): void { setOpen(value); setTransform({ scale: 1, x: 0, y: 0 }); pointers.current.clear(); }
  return <span className="recall-media" data-media-id={id} onPointerDown={event => event.stopPropagation()} onClick={event => event.stopPropagation()}>
    {error ? <span className="recall-media-error" role="status">{error}<button type="button" onClick={() => setRetry(value => value + 1)}>重试来源图片</button></span>
      : !src ? <span role="status">正在读取来源图片…</span> : <Dialog.Root open={open} onOpenChange={changeOpen}>
        <Dialog.Trigger asChild><button type="button" className="recall-media-preview" ref={trigger} aria-label={`放大来源图片：${alt || '截图'}`}><img src={src} alt={alt} loading="lazy" onError={() => setError('图片无法解码，请检查来源附件')}/><span><ZoomIn size={16}/>来源截图 · 点击放大</span></button></Dialog.Trigger>
        <Dialog.Portal><Dialog.Overlay className="recall-media-overlay"/><Dialog.Content className="recall-media-viewer" aria-describedby={description} onPointerDown={event => event.stopPropagation()} onClick={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()} onEscapeKeyDown={event => { event.preventDefault(); changeOpen(false); }} onCloseAutoFocus={event => { event.preventDefault(); trigger.current?.focus({ preventScroll: true }); }}>
          <header><Dialog.Title>{alt || '来源截图'}</Dialog.Title><Dialog.Close asChild><button type="button" aria-label="关闭来源图片"><X size={22}/></button></Dialog.Close></header>
          <Dialog.Description id={description}>双指缩放、拖动查看；图片操作不会评分。</Dialog.Description>
          <div className="recall-media-stage" ref={stage} onPointerDown={begin} onPointerMove={move} onPointerUp={end} onPointerCancel={end}><img src={src} alt={alt} draggable={false} style={{ transform: `translate(${transform.x}px,${transform.y}px) scale(${transform.scale})` }}/></div>
          <footer><button type="button" aria-label="缩小图片" disabled={transform.scale <= 1} onClick={() => setTransform(value => ({ scale: Math.max(1, value.scale - 0.5), x: 0, y: 0 }))}><ZoomOut size={20}/></button><span>{Math.round(transform.scale * 100)}%</span><button type="button" aria-label="放大图片" disabled={transform.scale >= 5} onClick={() => setTransform(value => ({ ...value, scale: Math.min(5, value.scale + 0.5) }))}><ZoomIn size={20}/></button><button type="button" aria-label="重置图片大小" onClick={() => setTransform({ scale: 1, x: 0, y: 0 })}><RotateCcw size={20}/></button></footer>
        </Dialog.Content></Dialog.Portal>
      </Dialog.Root>}
  </span>;
}
