export interface BuildInfo {
  version: string;
  builtAt: string;
  timezone: 'Asia/Shanghai';
}

export interface VersionMetadata extends BuildInfo {
  releaseVersion: string;
}

export function createVersionMetadata(build: BuildInfo): VersionMetadata {
  return { ...build, version: build.version.replace(/^1\.1-/, '1.0-'), releaseVersion: build.version };
}

const format = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

function versionFor(date: Date, series = '1.1'): string {
  const parts = Object.fromEntries(format.formatToParts(date).map(part => [part.type, part.value]));
  return `${series}-${parts.year}${parts.month}${parts.day}-${parts.hour}${parts.minute}`;
}

export function createBuildInfo(date = new Date(), override?: string): BuildInfo {
  if (!Number.isFinite(date.getTime())) throw new Error('Invalid build time');
  const version = override ?? versionFor(date);
  const parts = /^(1\.(?:0|1))-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})$/.exec(version);
  if (!parts) throw new Error('RECALL_BUILD_VERSION must use 1.1-YYYYMMDD-HHmm (legacy 1.0 accepted)');
  const builtAt = new Date(`${parts[2]}-${parts[3]}-${parts[4]}T${parts[5]}:${parts[6]}:00+08:00`);
  if (!Number.isFinite(builtAt.getTime()) || versionFor(builtAt, parts[1]) !== version) throw new Error('Invalid release version timestamp');
  return { version, builtAt: builtAt.toISOString(), timezone: 'Asia/Shanghai' };
}
