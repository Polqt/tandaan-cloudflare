import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import worker from '../src/index';

const IncomingRequest = Request<unknown, IncomingRequestCfProperties>;

describe('tandaan-replay-ai worker', () => {
	it('returns 401 without API key', async () => {
		const request = new IncomingRequest('http://example.com/health');
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);
		expect(response.status).toBe(401);
	});

	it('responds to /health with a valid API key', async () => {
		const request = new IncomingRequest('http://example.com/health', {
			headers: { 'x-api-key': env.API_SECRET },
		});
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);
		expect(response.status).toBe(200);
		const body = (await response.json()) as { status: string };
		expect(body.status).toBe('ok');
	});

	it('requires an API key for concept deep dive', async () => {
		const request = new IncomingRequest('http://example.com/concept-deep-dive', {
			method: 'POST',
			body: JSON.stringify({}),
		});
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);
		expect(response.status).toBe(401);
	});

	it('returns a deterministic concept deep dive fallback when evidence is weak', async () => {
		const request = new IncomingRequest('http://example.com/concept-deep-dive', {
			method: 'POST',
			headers: {
				'x-api-key': env.API_SECRET,
				'content-type': 'application/json',
			},
			body: JSON.stringify({
				documentId: 'doc_weak',
				concept: 'statistical significance',
				subject: 'Statistics',
				studentLevel: 'intermediate',
				depth: 'standard',
				documentContext: 'This project mentions survey results but does not discuss the target concept.',
				replayContext: {
					versions: [{
						versionId: 'v1',
						timestamp: '2026-05-24T10:00:00.000Z',
						content: 'This project mentions survey results.',
						summary: { addedBlocks: 1, updatedBlocks: 0, removedBlocks: 0 },
					}],
				},
			}),
		});
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);
		const body = await response.json() as {
			concept: string;
			confidence: number;
			groundedExplanation: { shortExplanation: string };
			processingTime: number;
		};

		expect(response.status).toBe(200);
		expect(response.headers.get('cache-control')).toBe('private, max-age=60');
		expect(response.headers.get('x-content-type-options')).toBe('nosniff');
		expect(body.concept).toBe('statistical significance');
		expect(body.confidence).toBeLessThan(0.5);
		expect(body.groundedExplanation.shortExplanation).toContain('statistical significance');
		expect(body.processingTime).toBeGreaterThanOrEqual(0);
	});

	it('falls back to a valid concept deep dive response when AI returns invalid JSON', async () => {
		const request = new IncomingRequest('http://example.com/concept-deep-dive', {
			method: 'POST',
			headers: {
				'x-api-key': env.API_SECRET,
				'content-type': 'application/json',
			},
			body: JSON.stringify({
				documentId: 'doc_ai_fallback',
				concept: 'statistical significance',
				subject: 'Statistics',
				assignmentTitle: 'Research Methods Group Report',
				studentLevel: 'intermediate',
				depth: 'advanced',
				documentContext: '[{"type":"paragraph","content":[{"type":"text","text":"We used p < 0.05 to determine statistical significance."}]}]',
				replayContext: {
					versions: [
						{
							versionId: 'v1',
							timestamp: '2026-05-24T10:00:00.000Z',
							content: 'Statistical significance means the result is probably true.',
							summary: { addedBlocks: 2, updatedBlocks: 1, removedBlocks: 0 },
						},
						{
							versionId: 'v2',
							timestamp: '2026-05-24T10:12:00.000Z',
							content: 'Statistical significance means the observed result is unlikely under the null hypothesis.',
							aiNarrative: 'The team corrected the definition after revision.',
							summary: { addedBlocks: 1, updatedBlocks: 5, removedBlocks: 2 },
						},
					],
					struggleSignals: [{
						versionId: 'v2',
						signal: 'deleted_definition',
						evidence: [
							'Original definition was replaced',
							'Several edits changed the meaning of p < 0.05',
						],
					}],
					teamDebate: [{
						authorName: 'Alex',
						text: 'Does p < 0.05 mean the hypothesis is 95% likely?',
					}],
				},
				options: {
					includePracticeQuestions: true,
					includeMisconceptions: true,
					includeResearchDirections: true,
					includeExternalSearchQueries: true,
				},
			}),
		});
		const testEnv = {
			...env,
			AI: {
				run: async () => ({ response: 'not json' }),
			},
			CACHE: undefined,
		};
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, testEnv, ctx);
		await waitOnExecutionContext(ctx);
		const body = await response.json() as {
			concept: string;
			masteryLevel: string;
			whereItAppeared: Array<{ versionId: string; evidence: string[] }>;
			practiceQuestions: unknown[];
			researchDirections: unknown[];
			cached: boolean;
		};

		expect(response.status).toBe(200);
		expect(body.concept).toBe('statistical significance');
		expect(body.masteryLevel).toBe('developing');
		expect(body.whereItAppeared[0]?.versionId).toBe('v2');
		expect(body.whereItAppeared[0]?.evidence).toContain('Original definition was replaced');
		expect(body.practiceQuestions.length).toBeGreaterThan(0);
		expect(body.researchDirections.length).toBeGreaterThan(0);
		expect(body.cached).toBe(false);
	});

	it('caches concept deep dive responses when CACHE is available', async () => {
		const payload = {
			documentId: 'doc_cached',
			concept: 'statistical significance',
			subject: 'Statistics',
			studentLevel: 'intermediate',
			depth: 'advanced',
			documentContext: 'We used p < 0.05 to determine statistical significance.',
			replayContext: {
				versions: [{
					versionId: 'v2',
					timestamp: '2026-05-24T10:12:00.000Z',
					content: 'Statistical significance means the observed result is unlikely under the null hypothesis.',
					aiNarrative: 'The team corrected the definition after revision.',
					summary: { addedBlocks: 1, updatedBlocks: 5, removedBlocks: 2 },
				}],
				struggleSignals: [{
					versionId: 'v2',
					signal: 'deleted_definition',
					evidence: ['Original definition was replaced'],
				}],
			},
		};
		const store = new Map<string, string>();
		let aiCalls = 0;
		const testEnv = {
			...env,
			AI: {
				run: async () => {
					aiCalls++;
					return {
						response: JSON.stringify({
							concept: 'statistical significance',
							subject: 'Statistics',
							masteryLevel: 'developing',
							confidence: 0.82,
							whyThisConceptMatters: 'It supports interpretation of the project results.',
							whereItAppeared: [{
								versionId: 'v2',
								reason: 'The definition was revised.',
								evidence: ['Original definition was replaced'],
							}],
							groundedExplanation: {
								shortExplanation: 'Statistical significance describes how unlikely data is under a null hypothesis.',
								deeperExplanation: 'It is not the probability that the hypothesis is true.',
								projectSpecificConnection: 'The project revised this concept during the replay.',
								simpleExample: 'A surprising coin result can be unlikely under a fair-coin model.',
							},
							misconceptionCheck: [],
							deepQuestions: [{
								question: 'Why is p < 0.05 not a probability that the hypothesis is true?',
								whyThisQuestionMatters: 'It separates evidence from hypothesis probability.',
								expectedReasoningPath: ['Name the null hypothesis', 'Explain conditional probability'],
							}],
							practiceQuestions: [],
							researchDirections: [],
							nextStudyStep: 'Rewrite the definition in your own words.',
						}),
					};
				},
			},
			CACHE: {
				get: async (key: string) => store.get(key) ?? null,
				put: async (key: string, value: string) => {
					store.set(key, value);
				},
			},
		};

		for (let index = 0; index < 2; index++) {
			const request = new IncomingRequest('http://example.com/concept-deep-dive', {
				method: 'POST',
				headers: {
					'x-api-key': env.API_SECRET,
					'content-type': 'application/json',
				},
				body: JSON.stringify(payload),
			});
			const ctx = createExecutionContext();
			const response = await worker.fetch(request, testEnv, ctx);
			await waitOnExecutionContext(ctx);
			const body = await response.json() as { cached: boolean };

			expect(response.status).toBe(200);
			expect(body.cached).toBe(index === 1);
		}

		expect(aiCalls).toBe(1);
	});
});
