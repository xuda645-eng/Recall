import { expect, it } from 'vitest';
import { memoryCardSummary } from '@/lib/memory-card-summary';

it('removes source evidence and Markdown syntax without modifying the answer', () => {
  const answer = '**结论**：[原理](https://example.com)\n\n### 来源证据\n私有转录与链接\n![截图](recall://image.png)\n\n## 补充\n- 可以继续学习';
  expect(memoryCardSummary(answer)).toBe('结论：原理 补充 可以继续学习');
  expect(answer).toContain('私有转录与链接');
});

it('does not treat a code heading as a source section and truncates only the summary', () => {
  expect(memoryCardSummary('```text\n### 来源证据\n只是代码\n```\n正文')).toContain('只是代码');
  expect(memoryCardSummary('一二三四五六', 4)).toBe('一二三四…');
});
