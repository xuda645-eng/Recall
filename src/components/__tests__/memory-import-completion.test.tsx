import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryImportCompletion } from '../memory-import-completion';

afterEach(cleanup);
describe('shared import completion', () => {
  it.each(['Markdown', '带图文件', '微信读书', '微信读书 · 智能合并'])('shows a distinct completed state for %s with navigation only on click', source => {
    const view = vi.fn();
    const again = vi.fn();
    render(<MemoryImportCompletion source={source} added={5} updated={2} skipped={1} processed={{ count: 6, label: '条原划线' }} locations={['微信读书 / 原书名']} onView={view} onContinue={again}/>);
    expect(screen.getByRole('heading', { name: '导入完成' })).toHaveFocus();
    expect(screen.getByRole('status')).toHaveTextContent('6 条原划线已处理');
    expect(screen.getByText('微信读书 / 原书名')).toBeInTheDocument();
    expect(screen.getByText('新增卡片')).toBeInTheDocument();
    expect(screen.getByText('更新卡片')).toBeInTheDocument();
    expect(screen.getByText('跳过已有')).toBeInTheDocument();
    expect(view).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '查看卡组' }));
    expect(view).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: '继续导入' }));
    expect(again).toHaveBeenCalledOnce();
  });
});
