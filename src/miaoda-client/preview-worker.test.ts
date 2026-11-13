import { renderHook } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { useRegisterSW } from './preview-worker';

it('does not register a worker or claim offline/update readiness', async () => {
  const register = vi.fn();
  vi.stubGlobal('navigator', { serviceWorker: { register } });
  try {
    const { result, unmount } = renderHook(() => useRegisterSW());
    expect(result.current.needRefresh[0]).toBe(false);
    expect(result.current.offlineReady[0]).toBe(false);
    await expect(result.current.updateServiceWorker()).rejects.toThrow('暂不支持离线安装和自动更新');
    expect(register).not.toHaveBeenCalled();
    unmount();
  } finally { vi.unstubAllGlobals(); }
});
