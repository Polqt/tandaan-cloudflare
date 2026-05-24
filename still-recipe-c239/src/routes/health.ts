import { Hono } from 'hono';
import type { Bindings } from '../types';

export const healthRoute = new Hono<{ Bindings: Bindings }>();

healthRoute.get('/health', (c) => {
	c.res.headers.set('Cache-Control', 'public, max-age=60');
	return c.json({ status: 'ok', timestamp: new Date().toISOString() });
});
