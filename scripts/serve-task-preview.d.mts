import type { Server } from 'node:http';

export function createTaskPreviewServer(options: { directory: string; demoSnapshot?: unknown }): Server;
