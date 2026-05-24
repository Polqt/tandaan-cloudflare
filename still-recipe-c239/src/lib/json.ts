import { z } from 'zod';

function safeJsonParse(value: string): unknown {
	try {
		return JSON.parse(value);
	} catch {
		return null;
	}
}

function extractJsonObject(text: string): unknown {
	const trimmed = text.trim();
	const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
	const candidate = fenced?.[1]?.trim() ?? trimmed;
	const parsed = safeJsonParse(candidate);
	if (parsed !== null) {
		return parsed;
	}

	const start = candidate.indexOf('{');
	const end = candidate.lastIndexOf('}');
	if (start >= 0 && end > start) {
		return safeJsonParse(candidate.slice(start, end + 1));
	}

	return null;
}

export function normalizeAiJsonOutput<T>(raw: string, schema: z.ZodType<T>, fallback: T): T {
	const parsed = extractJsonObject(raw);
	const result = schema.safeParse(parsed);
	return result.success ? result.data : fallback;
}
