import { Hono } from 'hono';
import { z } from 'zod';
import { runAiText } from '../lib/ai';
import { getCachedJson, hashCacheKey, putCachedJson } from '../lib/cache';
import { errorResponse, log, parseJsonBody } from '../lib/http';
import {
	batchTranslationRequestSchema,
	languageDetectionRequestSchema,
	translationRequestSchema,
} from '../schemas';
import type { Bindings } from '../types';

export const translateRoute = new Hono<{ Bindings: Bindings }>();

const translateCacheSchema = z.object({
	originalText: z.string(),
	translatedText: z.string(),
	detectedLanguage: z.string(),
	targetLanguage: z.string(),
});

translateRoute.post('/translate', async (c) => {
	const startTime = Date.now();
	const body = await parseJsonBody(c, translationRequestSchema);
	if (body instanceof Response) {
		return body;
	}

	const { text, targetLanguage, sourceLanguage } = body;
	const textHash = await hashCacheKey([text, targetLanguage, sourceLanguage ?? 'auto']);
	const cacheKey = `translate:${textHash}`;
	const cached = await getCachedJson(c.env, cacheKey, translateCacheSchema);
	if (cached) {
		return c.json({ ...cached, cached: true });
	}

	let detectedLanguage = sourceLanguage || 'English';
	if (!sourceLanguage) {
		try {
			detectedLanguage = await runAiText(c.env, [
				{ role: 'user', content: `Detect the language of this text. Respond with just the language name: "${text.slice(0, 500)}"` },
			], 50);
		} catch {
			detectedLanguage = 'English';
		}
	}

	try {
		const translatedText = await runAiText(c.env, [
			{ role: 'user', content: `Translate the following text from ${detectedLanguage} to ${targetLanguage}. Only output the translated text, nothing else:\n\n${text}` },
		], Math.min(text.length * 2, 4000));

		const result = { originalText: text, translatedText, detectedLanguage, targetLanguage };
		await putCachedJson(c.env, cacheKey, result);

		return c.json({
			...result,
			tokensUsed: Math.ceil((text.length + translatedText.length) / 4),
			processingTime: Date.now() - startTime,
		});
	} catch (error) {
		log('Translation failed', { error: String(error) });
		return errorResponse(c, 'Translation failed', 500, String(error));
	}
});

translateRoute.post('/batch-translate', async (c) => {
	const startTime = Date.now();
	const body = await parseJsonBody(c, batchTranslationRequestSchema);
	if (body instanceof Response) {
		return body;
	}

	const batchCacheSchema = z.object({ translatedText: z.string() });
	const results = await Promise.all(body.documents.map(async (doc) => {
		const cacheKey = `batch:${await hashCacheKey([doc.text, body.targetLanguage])}`;
		const cached = await getCachedJson(c.env, cacheKey, batchCacheSchema);
		if (cached) {
			return { id: doc.id, ...cached, cached: true };
		}

		try {
			const translatedText = await runAiText(c.env, [
				{ role: 'user', content: `Translate to ${body.targetLanguage}. Only output translated text:\n\n${doc.text.slice(0, 2000)}` },
			], 2000);
			await putCachedJson(c.env, cacheKey, { translatedText });
			return { id: doc.id, translatedText, cached: false };
		} catch (error) {
			return { id: doc.id, error: String(error), translatedText: null };
		}
	}));

	log('Batch translation completed', { count: results.length, targetLanguage: body.targetLanguage });
	return c.json({
		results,
		processingTime: Date.now() - startTime,
		totalDocuments: body.documents.length,
		processedCount: results.length,
	});
});

translateRoute.post('/detect-language', async (c) => {
	const body = await parseJsonBody(c, languageDetectionRequestSchema);
	if (body instanceof Response) {
		return body;
	}

	try {
		const result = await runAiText(c.env, [
			{ role: 'user', content: `Detect the language of this text. Respond with just the language name and confidence, like "English:95%": "${body.text.slice(0, 500)}"` },
		], 50);
		const [language, confidence] = result.split(':');

		return c.json({
			detectedLanguage: language.trim(),
			confidence: confidence ? Number.parseInt(confidence.replace('%', ''), 10) : null,
			text: body.text.slice(0, 100),
		});
	} catch (error) {
		return errorResponse(c, 'Detection failed', 500, String(error));
	}
});
