import type { Next } from 'hono';
import { errorResponse } from './http';
import type { AppContext } from '../types';

export async function authMiddleware(c: AppContext, next: Next) {
	const apiKey = c.req.header('x-api-key');

	if (!apiKey) {
		return errorResponse(c, 'Missing x-api-key header', 401);
	}
	if (apiKey !== c.env.API_SECRET) {
		return errorResponse(c, 'Invalid API key', 401);
	}

	return next();
}

export async function corsMiddleware(c: AppContext, next: Next) {
	const origin = c.req.header('Origin') || c.req.header('origin');
	const allowedOrigin = c.env.ALLOWED_ORIGIN || '*';
	const isAllowed = allowedOrigin === '*' || !origin || origin === allowedOrigin;

	c.res.headers.set('Access-Control-Allow-Origin', isAllowed && origin ? origin : allowedOrigin);
	c.res.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
	c.res.headers.set('Access-Control-Allow-Headers', 'Content-Type, x-api-key');
	c.res.headers.set('Access-Control-Max-Age', '86400');

	if (c.req.method === 'OPTIONS') {
		return new Response(null, { status: 204 });
	}

	return next();
}
