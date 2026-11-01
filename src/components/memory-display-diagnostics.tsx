import { useState } from 'react';
import { readDisplayDiagnostics } from '@/lib/display-diagnostics';

export function MemoryDisplayDiagnostics(): JSX.Element {
  const [report, setReport] = useState('');
  return <section className="m-panel" aria-label="顶部显示诊断">
    <h2>顶部显示诊断</h2>
    <p className="m-note">仅在本机显示运行模式与布局数值，不读取卡片、授权信息，不上传数据，也不修改设置。</p>
    <button type="button" className="m-secondary" onClick={() => setReport(JSON.stringify(readDisplayDiagnostics(), null, 2))}>显示运行信息</button>
    {report && <pre aria-label="显示诊断结果">{report}</pre>}
    <p className="m-note">如果主屏幕应用的 Logo 仍模糊，可在同一个安装实例中打开静态页对照。不需要另装图标，返回后卡片与进度保留。</p>
    <a className="m-secondary" href={`${import.meta.env.BASE_URL}status-diagnostics/`}>打开原安装内对照页</a>
  </section>;
}
