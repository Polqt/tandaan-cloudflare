import { z } from 'zod';
import { CACHE_TTL_SECONDS } from '../config';
import type { Bindings } from '../types';

export async function hashCacheKey(parts: Array<string | null | undefined>): Promise<string> {
	const input = parts.map((part) => part ?? '').join('');
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
	return [...new Uint8Array(digest)]
		.map((byte) => byte.toString(16).padStart(2, '0'))
		.join('');
}

export async function getCachedJson<T>(env: Bindings, cacheKey: string, schema: z.ZodType<T>): Promise<T | null> {
	if (!env.CACHE) {
		return null;
	}

	try {
		const cached = await env.CACHE.get(cacheKey);
		if (!cached) {
			return null;
		}

		const parsed = schema.safeParse(JSON.parse(cached));
		return parsed.success ? parsed.data : null;
	} catch {
		return null;
	}
}

export async function putCachedJson(env: Bindings, cacheKey: string, value: unknown) {
	if (!env.CACHE) {
		return;
	}

	try {
		await env.CACHE.put(cacheKey, JSON.stringify(value), { expirationTtl: CACHE_TTL_SECONDS });
	} catch {
		// Cache is an optimization only.
	}
}
