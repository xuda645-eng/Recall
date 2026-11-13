export type BackendTransport = (endpoint: string, options?: RequestInit) => Promise<Response>;

let transport: { request: BackendTransport } | undefined;

function validateEndpoint(endpoint: string): void {
  if (!endpoint.startsWith('/api/') || /[\s\\#]/.test(endpoint)) {
    throw new Error('Backend requests require an application-relative API path');
  }
  const pathname = decodeURIComponent(endpoint.split('?')[0]);
  if (pathname.includes('\\') || pathname.split('/').some(segment => segment === '.' || segment === '..')) {
    throw new Error('Backend requests cannot leave the application API path');
  }
}

export function installBackendTransport(next: BackendTransport): () => void {
  if (transport) throw new Error('A backend transport is already installed');
  const installation = { request: next };
  transport = installation;
  return () => { if (transport === installation) transport = undefined; };
}

export async function backendFetch(endpoint: string, options?: RequestInit): Promise<Response> {
  validateEndpoint(endpoint);
  if (transport) {
    if (options?.signal?.aborted) throw options.signal.reason;
    return transport.request(endpoint, options);
  }
  return globalThis.fetch(endpoint, options);
}
