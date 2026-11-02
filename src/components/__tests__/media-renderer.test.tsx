import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { RichCard } from '../RichCard';

vi.mock('../media-image', async () => {
  const { useState } = await import('react');
  return { MediaImage: function ImageState() { const [open, setOpen] = useState(false); return <button onClick={() => setOpen(true)}>{open ? 'Image remains open' : 'Open image'}</button>; } };
});
afterEach(cleanup);
it('retains viewer state when the reader or responsive shell rerenders', () => {
  const content = `Answer\n\n![Source](recall://${'a'.repeat(64)}.png)`;
  const view = render(<RichCard content={content}/>);
  fireEvent.click(screen.getByRole('button', { name: 'Open image' }));
  view.rerender(<RichCard content={content}/>);
  expect(screen.getByRole('button', { name: 'Image remains open' })).toBeDefined();
});
it('renders nested-alt and reference-style source images with the same resolver', () => {
  const id = 'a'.repeat(64) + '.png';
  render(<RichCard content={`![Source [1]](<recall://${id}> "Title")\n\n![Source][figure]\n\n[figure]: recall://${id}`}/>);
  expect(screen.getAllByRole('button', { name: 'Open image' })).toHaveLength(2);
});
