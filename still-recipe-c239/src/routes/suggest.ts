import { Hono } from 'hono';
import { runAiText } from '../lib/ai';
import { errorResponse, parseJsonBody } from '../lib/http';
import { suggestionRequestSchema } from '../schemas';
import type { Bindings } from '../types';

export const suggestRoute = new Hono<{ Bindings: Bindings }>();

suggestRoute.get('/suggest', async (c) => {
	const context = c.req.query('context');
	const documentTitle = c.req.query('title');

	if (!context) {
		return errorResponse(c, 'Missing context parameter', 400);
	}

	const prompt = `You are a helpful writing assistant. Based on the context below, suggest what the user might want to write next. Keep it to 1-2 sentences.

Document title: ${documentTitle || 'Untitled'}
Current content:
${context.slice(-1500)}`;

	const stream = new ReadableStream({
		async start(controller) {
			const encoder = new TextEncoder();
			try {
				const suggestion = await runAiText(c.env, [{ role: 'user', content: prompt }], 100);
				controller.enqueue(encoder.encode(`data: ${JSON.stringify({ suggestion })}\n\n`));
			} catch (error) {
				controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: String(error) })}\n\n`));
			} finally {
				controller.close();
			}
		},
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			'Connection': 'keep-alive',
		},
	});
});

suggestRoute.post('/suggest', async (c) => {
	const body = await parseJsonBody(c, suggestionRequestSchema);
	if (body instanceof Response) {
		return body;
	}

	const prompt = `You are a helpful writing assistant. Based on the context below, suggest what the user might want to write next. Keep it to 1-2 sentences.

Document title: ${body.documentTitle || 'Untitled'}
Current content:
${body.context.slice(-2000)}`;

	try {
		const suggestion = await runAiText(c.env, [{ role: 'user', content: prompt }], 100);
		return c.json({ suggestion, contextLength: body.context.length });
	} catch (error) {
		return errorResponse(c, 'Suggestion failed', 500, String(error));
	}
});
