import type { BuildInfo } from '@/lib/build-version';

export const APP_BUILD: BuildInfo = typeof __RECALL_BUILD_INFO__ === 'undefined'
  ? { version: '1.0-dev', builtAt: '', timezone: 'Asia/Shanghai' }
  : __RECALL_BUILD_INFO__;
