import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { MemoryImportChoices } from '../memory-import-choices';

function actions() {
  return { busy: false, onFile: vi.fn(), onWeread: vi.fn(), onManual: vi.fn(), onOther: vi.fn(), onHelp: vi.fn(), onExample: vi.fn() };
}
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it('presents exactly three equal primary sources and collapses infrequent actions', () => {
  render(<MemoryImportChoices {...actions()}/>);
  expect(screen.getByRole('group', { name: '常用导入' }).querySelectorAll('button')).toHaveLength(3);
  expect(screen.getByRole('button', { name: '选择 Markdown 文件' })).toBeDefined();
  expect(screen.getByRole('button', { name: '选择带图包' })).toBeDefined();
  expect(screen.getByRole('button', { name: '导入划线' })).toBeDefined();
  expect(screen.getByText('手动添加卡片').closest('details')?.open).toBe(false);
  expect(screen.getByText('CSV / Anki / Recall').closest('details')?.open).toBe(false);
});

it('uses the correct file filter and passes a selected file without importing automatically', () => {
  const handlers = actions();
  const view = render(<MemoryImportChoices {...handlers}/>);
  const picker = view.container.querySelector('input')!;
  const clicked = vi.spyOn(picker, 'click').mockImplementation(() => {});
  fireEvent.click(screen.getByRole('button', { name: '选择 Markdown 文件' }));
  expect(picker.accept).toBe('.md,.markdown');
  fireEvent.click(screen.getByRole('button', { name: '选择带图包' }));
  expect(picker.accept).toBe('.json');
  expect(clicked).toHaveBeenCalledTimes(2);
  const file = new File(['# Cards'], 'cards.md', { type: 'text/markdown' });
  fireEvent.change(picker, { target: { files: [file] } });
  expect(handlers.onFile).toHaveBeenCalledWith(file);
  expect(handlers.onManual).not.toHaveBeenCalled();
  expect(picker.value).toBe('');
});

it('keeps secondary routes and help reachable after opening other methods', () => {
  const handlers = actions();
  const view = render(<MemoryImportChoices {...handlers}/>);
  view.container.querySelector('details')!.open = true;
  fireEvent.click(screen.getByRole('button', { name: /^手动添加卡片/ }));
  fireEvent.click(screen.getByRole('button', { name: '其他导入：CSV / Anki / Recall' }));
  fireEvent.click(screen.getByRole('button', { name: '格式说明' }));
  fireEvent.click(screen.getByRole('button', { name: '下载 Markdown 示例' }));
  fireEvent.click(screen.getByRole('button', { name: '导入划线' }));
  for (const action of [handlers.onManual, handlers.onOther, handlers.onHelp, handlers.onExample, handlers.onWeread]) expect(action).toHaveBeenCalledTimes(1);
});

it('disables all entry actions while a file is being checked', () => {
  const view = render(<MemoryImportChoices {...actions()} busy/>);
  view.container.querySelector('details')!.open = true;
  for (const button of screen.getAllByRole('button')) expect((button as HTMLButtonElement).disabled).toBe(true);
});
