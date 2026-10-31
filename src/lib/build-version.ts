export interface BuildInfo {
  version: string;
  builtAt: string;
  timezone: 'Asia/Shanghai';
}

const format = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

function versionFor(date: Date): string {
  const parts = Object.fromEntries(format.formatToParts(date).map(part => [part.type, part.value]));
  return `1.0-${parts.year}${parts.month}${parts.day}-${parts.hour}${parts.minute}`;
}

export function createBuildInfo(date = new Date(), override?: string): BuildInfo {
  if (!Number.isFinite(date.getTime())) throw new Error('Invalid build time');
  const version = override ?? versionFor(date);
  const parts = /^1\.0-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})$/.exec(version);
  if (!parts) throw new Error('RECALL_BUILD_VERSION must use 1.0-YYYYMMDD-HHmm');
  const builtAt = new Date(`${parts[1]}-${parts[2]}-${parts[3]}T${parts[4]}:${parts[5]}:00+08:00`);
  if (!Number.isFinite(builtAt.getTime()) || versionFor(builtAt) !== version) throw new Error('Invalid release version timestamp');
  return { version, builtAt: builtAt.toISOString(), timezone: 'Asia/Shanghai' };
}
