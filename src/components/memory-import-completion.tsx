import { useEffect, useRef, type ReactNode } from 'react';
import { Check, ChevronRight } from 'lucide-react';
import './memory-import-completion.css';

interface Props {
  source: string;
  added: number;
  updated: number;
  skipped: number;
  locations: string[];
  processed?: { count: number; label: string };
  onView: () => void;
  onContinue: () => void;
  continueLabel?: string;
  children?: ReactNode;
}

export function MemoryImportCompletion({ source, added, updated, skipped, locations, processed, onView, onContinue, continueLabel = '继续导入', children }: Props): JSX.Element {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, []);
  return <section className="m-import-completion" aria-label="导入任务完成">
    <div className="m-import-completion-mark" aria-hidden="true"><Check size={28} strokeWidth={1.6}/></div>
    <p className="m-import-completion-source">{source}</p>
    <h2 ref={heading} tabIndex={-1}>导入完成</h2>
    <p role="status">{processed ? `${processed.count} ${processed.label}已处理，` : ''}卡片已保存到本机卡片库。</p>
    <div className="m-import-completion-counts">{[[added, '新增卡片'], [updated, '更新卡片'], [skipped, '跳过已有']].map(([count, label]) => <div key={label}><strong>{count}</strong><span>{label}</span></div>)}</div>
    {locations.length > 0 && <div className="m-import-completion-locations"><small>保存位置</small>{locations.map(location => <p key={location}>{location}</p>)}</div>}
    <div className="m-import-completion-actions"><button className="m-primary" type="button" onClick={onView}>查看卡组<ChevronRight size={18} aria-hidden="true"/></button>{children}<button className="m-text" type="button" onClick={onContinue}>{continueLabel}</button></div>
  </section>;
}
