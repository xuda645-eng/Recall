import { describe, expect, it } from 'vitest';
import { createBuildInfo, createVersionMetadata } from './build-version';

describe('release build identity', () => {
  it('uses the Shanghai build minute, including midnight, rather than the host timezone', () => {
    expect(createBuildInfo(new Date('2026-10-31T16:00:59.000Z'))).toEqual({ version: '1.1-20261101-0000', builtAt: '2026-10-31T16:00:00.000Z', timezone: 'Asia/Shanghai' });
    expect(createBuildInfo(new Date('2026-10-31T15:59:00.000Z')).version).toBe('1.1-20261031-2359');
  });
  it('keeps validation and publication builds byte-identical with an explicit release version', () => {
    const version = '1.1-20261101-0200';
    expect(createBuildInfo(new Date('2026-11-01T02:01:12.000Z'), version)).toEqual(createBuildInfo(new Date('2026-11-02T10:30:45.000Z'), version));
  });
  it('retains the legacy build format for compatibility and rejects unrecognized release series', () => {
    expect(createBuildInfo(new Date(), '1.0-20261101-0200').version).toBe('1.0-20261101-0200');
    expect(() => createBuildInfo(new Date(), '1.2-20261101-0200')).toThrow();
    expect(() => createBuildInfo(new Date(), '1.1-20260230-1200')).toThrow();
  });
  it('exposes V1.1 while preserving the metadata format accepted by already installed V1.0 refreshers', () => {
    const build = createBuildInfo(new Date(), '1.1-20261105-1801');
    const metadata = createVersionMetadata(build);
    expect(metadata).toEqual({ ...build, version: '1.0-20261105-1801', releaseVersion: '1.1-20261105-1801' });
    expect(metadata.version).toMatch(/^1\.0-\d{8}-\d{4}$/);
    expect(createVersionMetadata(createBuildInfo(new Date(), '1.0-20261101-0200')).releaseVersion).toBe('1.0-20261101-0200');
  });
  it.each(['1.3.0', '1.0-20260230-1200', '1.0-20261101-2400', '1.0-20261301-1200', '1.0-20261101-1260', '1.0-20261101-020000', ''])('rejects invalid identity %s', version => {
    expect(() => createBuildInfo(new Date(), version)).toThrow();
  });
  it('rejects an invalid build clock', () => {
    expect(() => createBuildInfo(new Date('invalid'))).toThrow('Invalid build time');
  });
});
