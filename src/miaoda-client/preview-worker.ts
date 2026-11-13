import { useState } from 'react';

export function useRegisterSW(_options?: unknown) {
  return {
    needRefresh: useState(false),
    offlineReady: useState(false),
    updateServiceWorker: async (_reload?: boolean): Promise<void> => {
      throw new Error('学习测试版暂不支持离线安装和自动更新，请在线刷新。本机数据未改动。');
    },
  };
}
