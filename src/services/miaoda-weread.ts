import { create } from 'zustand';
import { isLocalPreview, isMiaodaLearningPreview } from '@/lib/local-preview';
import { backendFetch, type BackendTransport } from '../../shared/client-http';
import type { WereadCapabilityStatus, WereadOperation } from '../../shared/weread-api';

interface WereadCapability extends WereadCapabilityStatus {
  phase: 'disabled' | 'loading' | 'ready' | 'unavailable';
  error: string;
}

const disabled: WereadCapability = { phase: 'disabled', available: false, aiAvailable: false, accountKey: null, error: '' };
const unavailable = '当前飞书账号未获微信读书授权，或服务尚未配置。可使用划线文件导入，本机卡片与草稿保留。';
const changedOwner = '登录账号发生变化或微信读书授权已失效，请重新打开应用；本机卡片与草稿保留。';
export const useMiaodaWeread = create<WereadCapability>(() => disabled);
export class WereadCapabilityError extends Error {}

interface Installation {
  controller: AbortController;
  statusController?: AbortController;
  accountKey: string | null;
}
let active: Installation | undefined;

function deny(message: string): void {
  useMiaodaWeread.setState({ ...disabled, phase: 'unavailable', error: message });
}

export function installMiaodaWeread(): () => void {
  if (!isMiaodaLearningPreview()) return () => {};
  if (active) throw new Error('WeRead already has an active capability bootstrap');
  const installation: Installation = { controller: new AbortController(), accountKey: null };
  active = installation;
  useMiaodaWeread.setState({ ...disabled, phase: 'loading' });
  const refresh = async () => {
    if (active !== installation || document.visibilityState === 'hidden') return;
    installation.statusController?.abort();
    const controller = new AbortController();
    installation.statusController = controller;
    try {
      const response = await backendFetch('/api/recall/weread/status', {
        method: 'GET', credentials: 'same-origin', cache: 'no-store',
        signal: AbortSignal.any([controller.signal, installation.controller.signal, AbortSignal.timeout(15000)]),
      });
      if (!response.ok) { await response.body?.cancel(); throw new WereadCapabilityError(unavailable); }
      const value: unknown = await response.json();
      if (active !== installation || controller.signal.aborted) return;
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new WereadCapabilityError(unavailable);
      const status = value as Record<string, unknown>;
      if (typeof status.available !== 'boolean' || typeof status.aiAvailable !== 'boolean'
        || (status.available ? typeof status.accountKey !== 'string' || !/^[a-f0-9]{64}$/.test(status.accountKey)
          : status.accountKey !== null || status.aiAvailable)) throw new WereadCapabilityError(unavailable);
      if (!status.available) { deny(unavailable); return; }
      const accountKey = status.accountKey as string;
      if (installation.accountKey && installation.accountKey !== accountKey) { deny(changedOwner); return; }
      installation.accountKey = accountKey;
      useMiaodaWeread.setState({ phase: 'ready', available: true, aiAvailable: status.aiAvailable, accountKey, error: '' });
    } catch {
      if (active === installation && !controller.signal.aborted) deny(unavailable);
    }
  };
  const refreshVisible = () => { void refresh(); };
  window.addEventListener('focus', refreshVisible);
  window.addEventListener('online', refreshVisible);
  document.addEventListener('visibilitychange', refreshVisible);
  void refresh();
  return () => {
    if (active !== installation) return;
    active = undefined;
    installation.controller.abort();
    installation.statusController?.abort();
    window.removeEventListener('focus', refreshVisible);
    window.removeEventListener('online', refreshVisible);
    document.removeEventListener('visibilitychange', refreshVisible);
    useMiaodaWeread.setState(disabled);
  };
}

const aiRoutes = new Set<WereadOperation>(['question', 'merge', 'budget']);

function authorized(path: WereadOperation): WereadCapability {
  const capability = useMiaodaWeread.getState();
  if (!isMiaodaLearningPreview() || !active || capability.phase !== 'ready' || !capability.available || !capability.accountKey) {
    throw new WereadCapabilityError(capability.phase === 'loading' ? '正在检查微信读书授权，请稍候'
      : capability.error || '本地隔离预览不连接在线服务，请导入划线文件');
  }
  if (aiRoutes.has(path) && !capability.aiAvailable) throw new WereadCapabilityError('AI 尚未配置，请手动编辑问题或保留摘录；不会发送原文到模型');
  return capability;
}

export async function fetchWeread(path: WereadOperation, input: unknown, signal: AbortSignal): Promise<Response> {
  const installation = isLocalPreview() ? active : undefined;
  const capability = isLocalPreview() ? authorized(path) : undefined;
  const response = await backendFetch(capability ? `/api/recall/weread/${path}` : `/api/weread/${path}`, {
    method: 'POST', credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...(capability ? { 'X-Recall-Account-Key': capability.accountKey! } : {}) },
    body: JSON.stringify(input), signal: installation ? AbortSignal.any([signal, installation.controller.signal]) : signal,
    ...(capability ? { cache: 'no-store' as const } : {}),
  });
  if (capability) {
    const current = useMiaodaWeread.getState();
    if (active !== installation || !current.available || current.accountKey !== capability.accountKey) {
      await response.body?.cancel();
      throw new WereadCapabilityError(changedOwner);
    }
    const responseAccount = response.headers.get('X-Recall-Account-Key');
    if ([401, 403, 409].includes(response.status) || responseAccount && responseAccount !== capability.accountKey) {
      await response.body?.cancel();
      deny(changedOwner);
      throw new WereadCapabilityError(changedOwner);
    }
  }
  return response;
}

export function wereadServiceError(status: number, path?: WereadOperation): string {
  if (status === 503 && isMiaodaLearningPreview() && path && aiRoutes.has(path)) return 'AI 尚未配置或需要维护，请手动整理问题或保留摘录；已有草稿保留';
  return status === 401 || status === 403 ? isMiaodaLearningPreview() ? changedOwner : '请先在“设置与数据 > 云同步”授权当前设备，再连接微信读书'
    : status === 429 ? '已达到在线调用上限，请稍后重试或手动出题'
      : status === 503 ? '在线连接尚未配置或需要维护，请使用本地文件导入'
        : '在线服务超时或响应无效，请重试；已有草稿不会自动导入';
}

export function forwardMiaodaWeread(endpoint: string, options: RequestInit | undefined, transport: BackendTransport): Promise<Response> | null {
  if (!isMiaodaLearningPreview() || !active) return null;
  const method = options?.method || 'GET';
  if (endpoint === '/api/recall/weread/status' && method === 'GET') return transport(endpoint, options);
  const match = /^\/api\/recall\/weread\/(books|book|progress|question|merge|budget)$/.exec(endpoint);
  if (!match || method !== 'POST') return null;
  try {
    const capability = authorized(match[1] as WereadOperation);
    if (new Headers(options?.headers).get('X-Recall-Account-Key') !== capability.accountKey) {
      return Promise.resolve(Response.json({ error: changedOwner }, { status: 403 }));
    }
    return transport(endpoint, options);
  } catch {
    return Promise.resolve(Response.json({ error: unavailable }, { status: 503 }));
  }
}
