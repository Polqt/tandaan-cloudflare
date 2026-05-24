import { z } from 'zod';
import type { AppContext } from '../types';

export function log(message: string, data?: Record<string, unknown>) {
	console.log(JSON.stringify({
		timestamp: new Date().toISOString(),
		service: 'tandaan-replay-ai',
		message,
		...data,
	}));
}

export function errorResponse(c: AppContext, error: string, status: 400 | 401 | 404 | 500, details?: unknown) {
	return c.json({ error, ...(details ? { details } : {}) }, status);
}

export async function parseJsonBody<T>(c: AppContext, schema: z.ZodType<T>): Promise<T | Response> {
	try {
		return schema.parse(await c.req.json());
	} catch (error) {
		return errorResponse(
			c,
			'Invalid request body',
			400,
			error instanceof z.ZodError ? error.errors : 'Parse error',
		);
	}
}
