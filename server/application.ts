import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { Express } from 'express';
import type { ServerEnv } from '../shared/server';
import { recallHttpHandler, validatePublicOrigin } from './http';

class RecallModule {}
Module({})(RecallModule);

export async function createRecallApplication(env: ServerEnv, options: { publicOrigin: string; trustedProxies?: string[] }) {
  validatePublicOrigin(options.publicOrigin);
  if (env.DB.dialect !== 'postgresql' || !env.MEDIA) throw new Error('PostgreSQL and private object storage adapters are required');
  const app = await NestFactory.create(RecallModule, { bodyParser: false, logger: false });
  const express = app.getHttpAdapter().getInstance() as Express;
  express.disable('x-powered-by');
  express.set('trust proxy', options.trustedProxies?.length ? options.trustedProxies : false);
  express.use('/api', recallHttpHandler(env, options.publicOrigin));
  return app;
}
