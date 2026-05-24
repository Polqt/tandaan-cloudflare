import { AI_MODEL } from '../config';
import type { AiMessage, Bindings } from '../types';

function getAiText(response: unknown): string {
	if (response && typeof response === 'object') {
		const maybeResponse = response as { response?: unknown; text?: unknown };
		if (typeof maybeResponse.response === 'string') {
			return maybeResponse.response.trim();
		}
		if (typeof maybeResponse.text === 'string') {
			return maybeResponse.text.trim();
		}
	}

	return String(response ?? '').trim();
}

export async function runAiText(env: Bindings, messages: AiMessage[], maxTokens: number): Promise<string> {
	const response = await env.AI.run(AI_MODEL, {
		messages,
		max_tokens: maxTokens,
	});

	return getAiText(response);
}
