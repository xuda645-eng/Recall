import { useEffect, useRef, useState } from 'react';
import { compressImage } from '@/services/media-compress';
import { saveMedia } from '@/services/media-storage';
import { mediaRefs } from '../../shared/media';

export function MediaEditor({ onBusy, onDirty }: { onBusy: (busy: boolean) => void; onDirty: () => void }): JSX.Element {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [refs, setRefs] = useState<string[]>([]);
  const root = useRef<HTMLDivElement>(null);
  const files = useRef<HTMLInputElement>(null);
  const replacement = useRef<string | null>(null);
  function answer(): HTMLTextAreaElement | null { return root.current?.closest('form')?.elements.namedItem('back') as HTMLTextAreaElement | null; }
  function replaceReference(text: string, id: string, markup: string): string {
    if (markup) return text.replaceAll(`recall://${id}`, `recall://${mediaRefs([markup])[0]}`);
    const uri = `recall:\\/\\/${id.replace('.', '\\.')}`;
    return text.replace(new RegExp(`!\\[(?:\\\\.|[^\\[\\]]|\\[[^\\]]*\\])*\\]\\(\\s*<?${uri}>?(?:\\s+(?:"[^"]*"|'[^']*'))?\\s*\\)`, 'g'), '').replaceAll(`recall://${id}`, '');
  }
  useEffect(() => {
    const textarea = answer();
    const input = files.current;
    const cancel = () => { replacement.current = null; };
    const refresh = () => setRefs(mediaRefs([textarea?.value ?? '']));
    refresh(); textarea?.addEventListener('input', refresh);
    input?.addEventListener('cancel', cancel);
    return () => { textarea?.removeEventListener('input', refresh); input?.removeEventListener('cancel', cancel); };
  }, []);
  return <div className="recall-media-editor" ref={root}><label>附加来源截图<input ref={files} type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={event => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    const textarea = input.form?.elements.namedItem('back') as HTMLTextAreaElement | null;
    input.value = '';
    if (!file || !textarea) { replacement.current = null; return; }
    setBusy(true); onBusy(true); setError('');
    void compressImage(file).then(async asset => {
      const markup = `![来源截图](recall://${asset.id})`;
      if (textarea.value.length + markup.length + 2 > 20000) throw new Error('答案过长，无法附加图片');
      await saveMedia([asset]);
      if (replacement.current) textarea.value = replaceReference(textarea.value, replacement.current, markup);
      else if (!textarea.value.includes(markup)) textarea.value += `\n\n${markup}`;
      onDirty(); setRefs(mediaRefs([textarea.value]));
    }).catch(failure => setError(failure instanceof Error ? failure.message : '图片处理失败')).finally(() => { replacement.current = null; setBusy(false); onBusy(false); });
  }}/></label><small>本机压缩后保存，最多 512 KB / 张；请确认文字清晰。移除只取消本卡引用，不删除其他卡共用的图片。</small><p role="status">当前答案附有 {refs.length} 张来源图片</p>{refs.map((id, index) => <div key={id}><span>来源截图 {index + 1}</span><button type="button" className="m-secondary" disabled={busy} onClick={() => { replacement.current = id; files.current?.click(); }}>替换截图 {index + 1}</button><button type="button" className="m-secondary" disabled={busy} onClick={() => { const textarea = answer(); if (textarea) { textarea.value = replaceReference(textarea.value, id, ''); onDirty(); setRefs(mediaRefs([textarea.value])); } }}>移除截图 {index + 1}</button></div>)}{busy && <p role="status">正在压缩并保存图片</p>}{error && <p role="alert">{error}</p>}</div>;
}
