import { useRef } from 'react';
import { BookOpen, ChevronDown, ChevronRight, FileText, Images, Plus, Upload } from 'lucide-react';
import './memory-import-choices.css';

interface MemoryImportChoicesProps {
  busy: boolean;
  onFile: (file?: File) => void;
  onWeread: () => void;
  onManual: () => void;
  onOther: () => void;
  onHelp: () => void;
  onExample: () => void;
}

export function MemoryImportChoices({ busy, onFile, onWeread, onManual, onOther, onHelp, onExample }: MemoryImportChoicesProps): JSX.Element {
  const files = useRef<HTMLInputElement>(null);
  function chooseFile(accept: string): void {
    if (!files.current) return;
    files.current.accept = accept;
    files.current.click();
  }
  return <section className="m-import-start" aria-labelledby="memory-import-heading">
    <header className="m-import-heading">
      <h1 id="memory-import-heading">把知识，收进卡片。</h1>
      <p>选择一种来源，先预览，再确认导入。</p>
    </header>
    <div className="m-import-sources" role="group" aria-label="常用导入">
      <button type="button" className="m-import-source" disabled={busy} aria-label="选择 Markdown 文件" onClick={() => chooseFile('.md,.markdown')}>
        <span className="m-import-source-icon" aria-hidden="true"><FileText size={23}/></span>
        <span className="m-import-source-copy"><strong>Markdown 文件</strong><small>文字卡片 · .md</small></span>
        <ChevronRight size={18} aria-hidden="true"/>
      </button>
      <button type="button" className="m-import-source" disabled={busy} aria-label="选择带图包" onClick={() => chooseFile('.json')}>
        <span className="m-import-source-icon" aria-hidden="true"><Images size={23}/></span>
        <span className="m-import-source-copy"><strong>带图包</strong><small>卡片与来源截图 · .recall-media.json</small></span>
        <ChevronRight size={18} aria-hidden="true"/>
      </button>
      <button type="button" className="m-import-source" disabled={busy} aria-label="导入划线" onClick={onWeread}>
        <span className="m-import-source-icon" aria-hidden="true"><BookOpen size={23}/></span>
        <span className="m-import-source-copy"><strong>微信读书</strong><small>导入书籍划线，保留原文</small></span>
        <ChevronRight size={18} aria-hidden="true"/>
      </button>
    </div>
    <input ref={files} type="file" accept=".md,.markdown,.json" hidden aria-label="导入文件" onChange={event => { onFile(event.currentTarget.files?.[0]); event.currentTarget.value = ''; }}/>
    <details className="m-import-more">
      <summary>其他方式<ChevronDown size={18} aria-hidden="true"/></summary>
      <div className="m-import-secondary">
        <button type="button" disabled={busy} onClick={onManual}><Plus size={18} aria-hidden="true"/><span><strong>手动添加卡片</strong><small>自己填写问题与答案</small></span><ChevronRight size={16} aria-hidden="true"/></button>
        <button type="button" disabled={busy} aria-label="其他导入：CSV / Anki / Recall" onClick={onOther}><Upload size={18} aria-hidden="true"/><span><strong>CSV / Anki / Recall</strong><small>迁移资料或恢复普通备份</small></span><ChevronRight size={16} aria-hidden="true"/></button>
        <div className="m-import-help"><button type="button" disabled={busy} onClick={onHelp}>格式说明</button><button type="button" disabled={busy} onClick={onExample}>下载 Markdown 示例</button></div>
      </div>
    </details>
  </section>;
}
