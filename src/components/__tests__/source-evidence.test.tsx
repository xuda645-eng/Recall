import { cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, expect, it, vi } from 'vitest';
import { RichCard } from '../RichCard';

vi.mock('../media-image', () => ({ MediaImage: ({ alt }: { alt: string }) => <img alt={alt}/> }));
afterEach(cleanup);
const image = `![配图](recall://${'a'.repeat(64)}.webp)`;

it('renders the answer, source images, then a closed evidence disclosure without rewriting content', () => {
  const content = `整理后的答案。\n\n### 来源证据\n\n标黄原文：[原文](https://example.com/source)\n\n> 引用原文。\n\n${image}\n\n![第二张](recall://${'b'.repeat(64)}.png)`;
  const { container } = render(<RichCard content={content} collapseSourceEvidence/>);
  const disclosure = container.querySelector('details')!;
  expect(disclosure.hasAttribute('open')).toBe(false);
  expect(disclosure.querySelector('summary')).toHaveTextContent('来源证据');
  expect(disclosure.querySelector('blockquote')).toHaveTextContent('引用原文。');
  expect(disclosure.querySelector('a')).toHaveAttribute('href', 'https://example.com/source');
  expect(disclosure.querySelector('img')).toBeNull();
  const prose = container.firstElementChild!;
  expect([...prose.children].map(child => child.tagName)).toEqual(['P', 'P', 'P', 'DETAILS']);
  expect(screen.getByAltText('配图').closest('p')?.nextElementSibling?.querySelector('img')).toHaveAttribute('alt', '第二张');
  expect(content).toContain('### 来源证据');
});

it('keeps text-only cards collapsible and ordinary sections after evidence visible', () => {
  const { container } = render(<RichCard collapseSourceEvidence content={'答案\n\n## 来源证据\n\n### 标黄原文\n\n> 证据\n\n## 练习\n\n继续复述。'}/>);
  const disclosure = container.querySelector('details')!;
  expect(disclosure.querySelector('h3')).toHaveTextContent('标黄原文');
  expect(disclosure.nextElementSibling).toHaveTextContent('练习');
  expect(screen.getByText('继续复述。').closest('details')).toBeNull();
  expect(container.querySelector('img')).toBeNull();
});

it('does not mistake code blocks, ordinary prose or blockquoted headings for an evidence section', () => {
  const { container } = render(<RichCard collapseSourceEvidence content={'答案含来源证据字样。\n\n```md\n### 来源证据\n```\n\n> ### 来源证据\n> 引文内部的标题\n\n### 其它章节\n\n正文。'}/>);
  expect(container.querySelector('details')).toBeNull();
  expect(container.querySelector('code')).toHaveTextContent('### 来源证据');
});

it('retains ordinary rendering when folding is not requested', () => {
  const { container } = render(<RichCard content={`答案\n\n### 来源证据\n\n原文\n\n${image}`}/>);
  expect(container.querySelector('details')).toBeNull();
  expect(container.querySelector('h3')).toHaveTextContent('来源证据');
});

it('extracts images nested in source quotes without dropping accompanying evidence text', () => {
  const { container } = render(<RichCard collapseSourceEvidence content={`答案\n\n### 来源证据\n\n> ${image}\n>\n> 图对应的原文。`}/>);
  expect(container.querySelector('details img')).toBeNull();
  expect(container.querySelector('details blockquote')).toHaveTextContent('图对应的原文。');
  expect(screen.getByAltText('配图').closest('p')?.nextElementSibling?.tagName).toBe('DETAILS');
});

it('does not allow card HTML to create interactive controls or unsafe links', () => {
  const { container } = render(<RichCard collapseSourceEvidence allowHtml content={'答案\n\n### 来源证据\n\n<details open><summary>伪造控件</summary><button>执行</button></details>\n\n[危险](javascript:alert(1))\n\n<script>alert(1)</script>'}/>);
  expect(container.querySelectorAll('details')).toHaveLength(1);
  expect(container.querySelectorAll('summary')).toHaveLength(1);
  expect(container.querySelector('details')).not.toHaveAttribute('open');
  expect(container.querySelector('button, script')).toBeNull();
  expect(container.querySelector('a')?.getAttribute('href') ?? '').not.toMatch(/^javascript:/);
});

it('does not create an empty disclosure for image-only source sections', () => {
  const { container } = render(<RichCard collapseSourceEvidence content={`答案\n\n### 来源证据\n\n${image}`}/>);
  expect(container.querySelector('details')).toBeNull();
  expect(screen.getByAltText('配图')).toBeDefined();
});
