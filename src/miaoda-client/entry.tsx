import React from 'react';
import { createRoot } from 'react-dom/client';
import '@/fonts.css';
import '@/lib/i18n';
import '@/index.css';
import '@/reading-fixes.css';
import './layout.css';
import { App } from '@/App';
import { installBackendTransport } from '../../shared/client-http';
import type { BackendTransport } from '../../shared/client-http';
import { installPersonalSync } from '@/services/personal-sync';
import { isMiaodaLearningPreview } from '@/lib/local-preview';
import { MEDIA_ID } from '../../shared/media';
import { forwardMiaodaWeread, installMiaodaWeread } from '@/services/miaoda-weread';

interface ActiveMount {
  element: HTMLElement;
  root: ReturnType<typeof createRoot>;
  removeTransport: () => void;
  owners: Set<symbol>;
  personalTransport?: BackendTransport;
  stopPersonal?: () => void;
  stopWeread?: () => void;
}

let activeMount: ActiveMount | undefined;

export function mountRecallPwa(element: HTMLElement, personalTransport?: BackendTransport): () => void {
  if (!['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname) && !isMiaodaLearningPreview()) {
    throw new Error('This migration client is restricted to local integration');
  }
  let current = activeMount;
  if (personalTransport && !isMiaodaLearningPreview()) throw new Error('Personal synchronization requires the explicit Miaoda build');
  if (current && current.element !== element) {
    throw new Error('Recall already has an active mount in another element');
  }
  if (current && current.personalTransport !== personalTransport) throw new Error('Cannot change the gateway of an active Recall mount');
  if (!current) {
    const removeTransport = installBackendTransport(async (endpoint, options) => {
      if (personalTransport && /^\/api\/recall\/personal-sync(?:\?|$)/.test(endpoint)) return personalTransport(endpoint, options);
      const weread = personalTransport && forwardMiaodaWeread(endpoint, options, personalTransport);
      if (weread) return weread;
      const image = endpoint.startsWith('/api/media/') ? endpoint.slice('/api/media/'.length) : '';
      const account = localStorage.getItem('recall.miaoda.personal.account.v1');
      if (personalTransport && MEDIA_ID.test(image) && account && /^[a-f0-9]{64}$/.test(account)
        && localStorage.getItem('recall.miaoda.personal.enabled.v1') === '1') {
        const headers = new Headers(options?.headers);
        headers.set('X-Recall-Account-Key', account);
        return personalTransport(`/api/recall/personal-media/${image}`, { ...options, headers });
      }
      return Response.json({
      error: '妙搭云同步尚未接入，本机数据不受影响。',
      }, { status: 503 });
    });
    let root: ReturnType<typeof createRoot> | undefined;
    let stopPersonal: (() => void) | undefined;
    let stopWeread: (() => void) | undefined;
    try {
      root = createRoot(element);
      if (personalTransport) stopPersonal = installPersonalSync();
      if (personalTransport) stopWeread = installMiaodaWeread();
      root.render(<React.StrictMode><App /></React.StrictMode>);
    } catch (error) {
      try { root?.unmount(); } finally { try { stopWeread?.(); } finally { try { stopPersonal?.(); } finally { removeTransport(); } } }
      throw error;
    }
    current = { element, root, removeTransport, owners: new Set(), personalTransport, stopPersonal, stopWeread };
    activeMount = current;
  }
  const owner = Symbol();
  current.owners.add(owner);
  return () => {
    if (!current.owners.delete(owner) || current.owners.size) return;
    activeMount = undefined;
    try { current.root.unmount(); } finally { try { current.stopWeread?.(); } finally { try { current.stopPersonal?.(); } finally { current.removeTransport(); } } }
  };
}
