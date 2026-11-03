interface EvidenceNode {
  type: string;
  tagName?: string;
  value?: string;
  children?: EvidenceNode[];
  properties?: Record<string, unknown>;
}

function textContent(node: EvidenceNode): string {
  return node.value ?? node.children?.map(textContent).join('') ?? '';
}

function headingLevel(node: EvidenceNode): number {
  return node.type === 'element' && /^h[1-6]$/.test(node.tagName ?? '') ? Number(node.tagName!.slice(1)) : 0;
}

function extractImages(node: EvidenceNode, images: EvidenceNode[]): EvidenceNode | null {
  if (node.type === 'element' && node.tagName === 'img') {
    images.push({ type: 'element', tagName: 'p', properties: {}, children: [node] });
    return null;
  }
  if (!node.children) return node;
  const count = images.length;
  const children = node.children.map(child => extractImages(child, images)).filter((child): child is EvidenceNode => child !== null);
  if (images.length > count && children.every(child => child.type === 'text' && !child.value?.trim())) return null;
  return { ...node, children };
}

export function rehypeSourceEvidence() {
  return (tree: { children: EvidenceNode[] }): void => {
    const children: EvidenceNode[] = [];
    for (let index = 0; index < tree.children.length; index++) {
      const heading = tree.children[index];
      const level = headingLevel(heading);
      if (!level || textContent(heading).trim() !== '来源证据') {
        children.push(heading);
        continue;
      }
      let end = index + 1;
      while (end < tree.children.length) {
        const nextLevel = headingLevel(tree.children[end]);
        if (nextLevel && nextLevel <= level) break;
        end++;
      }
      const images: EvidenceNode[] = [];
      const evidence = tree.children.slice(index + 1, end).map(node => extractImages(node, images))
        .filter((node): node is EvidenceNode => node !== null);
      children.push(...images);
      if (evidence.some(node => node.type !== 'text' || node.value?.trim())) {
        children.push({ type: 'element', tagName: 'details', properties: { className: ['m-source-evidence'] }, children: [
          { type: 'element', tagName: 'summary', properties: {}, children: [{ type: 'text', value: '来源证据' }] },
          ...evidence,
        ] });
      } else if (!images.length) {
        children.push(heading, ...evidence);
      }
      index = end - 1;
    }
    tree.children = children;
  };
}
