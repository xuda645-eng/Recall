export function memoryCardSummary(markdown: string, limit = 90): string {
  let evidenceLevel = 0;
  let fenced = false;
  const lines = markdown.split('\n').filter(line => {
    if (/^\s*(```|~~~)/.test(line)) { fenced = !fenced; return false; }
    const heading = fenced ? null : line.match(/^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (heading && evidenceLevel && heading[1].length <= evidenceLevel) evidenceLevel = 0;
    if (heading?.[2] === '来源证据') { evidenceLevel = heading[1].length; return false; }
    return !evidenceLevel;
  });
  const text = lines.join('\n')
    .replace(/<!--[^]*?-->/g, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/^\s{0,3}(?:#{1,6}\s+|>\s*|[-*+]\s+|\d+[.)]\s+)/gm, '')
    .replace(/[*_`~]/g, '')
    .replace(/\s+/g, ' ').trim();
  return text.length > limit ? `${text.slice(0, limit)}…` : text;
}
