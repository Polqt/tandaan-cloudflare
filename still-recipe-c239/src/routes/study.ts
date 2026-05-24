import { Hono } from 'hono';
import { runAiText } from '../lib/ai';
import { parseBlockNoteToPlainText } from '../lib/blocknote';
import { getCachedJson, hashCacheKey, putCachedJson } from '../lib/cache';
import { errorResponse, log, parseJsonBody } from '../lib/http';
import { normalizeAiJsonOutput } from '../lib/json';
import {
	buildDetectStrugglePrompt,
	buildReplayContext,
	buildStudyExplanationPrompt,
	buildStudyReplayPrompt,
} from '../lib/prompts';
import {
	detectStruggleRequestSchema,
	detectStruggleResponseSchema,
	generateStudyReplayRequestSchema,
	studyExplanationRequestSchema,
	studyExplanationResponseSchema,
	studyReplayResponseSchema,
} from '../schemas';
import type {
	Bindings,
	DetectStruggleResponse,
	GenerateStudyReplayRequest,
	StudyExplanationRequest,
	StudyExplanationResponse,
	StudyReplayResponse,
} from '../types';

export const studyRoute = new Hono<{ Bindings: Bindings }>();

function extractDebateFrictionEvidence(text: string, comments: string[] = []): string[] {
	const signals = [
		/\b(however|but|although|instead|contradicts|conflicts?|unclear|confusing|not sure|maybe|rework|rewrite|debate|disagree|actually)\b/i,
		/\b(define|definition|means|causes?|because|therefore|evidence|claim)\b/i,
		/\?$/,
	];

	const candidates = [...text.split(/(?<=[.!?])\s+/), ...comments]
		.map((item) => item.replace(/\s+/g, ' ').trim())
		.filter((item) => item.length >= 20 && item.length <= 240);

	const matched = candidates.filter((item) => signals.some((signal) => signal.test(item)));
	return [...new Set(matched)].slice(0, 5);
}

function noStruggleResponse(): DetectStruggleResponse {
	return {
		struggleDetected: false,
		confidence: 0.25,
		concepts: [],
		recommendedAction: 'none',
	};
}

function fallbackStudyReplay(input: GenerateStudyReplayRequest): StudyReplayResponse {
	const conceptMap = new Map<string, { whereItAppeared: Set<string>; evidence: string[] }>();
	for (const moment of input.struggleMoments) {
		for (const concept of moment.concepts) {
			const entry = conceptMap.get(concept) ?? { whereItAppeared: new Set<string>(), evidence: [] };
			entry.whereItAppeared.add(moment.versionId);
			entry.evidence.push(...moment.evidence);
			conceptMap.set(concept, entry);
		}
	}

	const concepts = [...conceptMap.entries()]
		.sort((a, b) => b[1].evidence.length - a[1].evidence.length)
		.slice(0, 5)
		.map(([concept, data]) => ({
			concept,
			whyItMatters: 'This concept appeared in moments where the team revised, debated, or clarified the document.',
			whereItAppeared: [...data.whereItAppeared],
			explanation: `Review ${concept} using the evidence from your replay before comparing it with your final draft.`,
			practiceQuestions: [
				`How would you explain ${concept} in your own words?`,
				`Which replay moment best shows how your team refined ${concept}?`,
			],
			teamDebateSummary: data.evidence.slice(0, 2).join(' '),
		}));

	return {
		title: `${input.title} Study Replay`,
		overview: 'This guide highlights concepts that surfaced during revision and discussion.',
		conceptsToReview: concepts,
		studyPlan: [
			{ step: 1, task: 'Review the replay moments with the strongest evidence of revision or debate.' },
			{ step: 2, task: 'Rewrite each concept explanation using the final document as support.' },
			{ step: 3, task: 'Answer the practice questions without looking at the document first.' },
		],
	};
}

studyRoute.post('/detect-struggle', async (c) => {
	const body = await parseJsonBody(c, detectStruggleRequestSchema);
	if (body instanceof Response) {
		return body;
	}

	const currentText = parseBlockNoteToPlainText(body.currentContent);
	const previousText = body.previousContent ? parseBlockNoteToPlainText(body.previousContent) : null;
	const evidence = extractDebateFrictionEvidence(currentText, body.context?.recentComments ?? []);
	const totalChanges = body.changeSummary.addedBlocks + body.changeSummary.updatedBlocks + body.changeSummary.removedBlocks;
	const hasStrongLocalSignal = body.changeSummary.updatedBlocks >= 4
		|| body.changeSummary.removedBlocks >= 3
		|| totalChanges >= 12
		|| evidence.length >= 2;

	if (!hasStrongLocalSignal) {
		return c.json(noStruggleResponse());
	}

	const contentHash = await hashCacheKey([body.currentContent, body.previousContent ?? '']);
	const cacheKey = `detect-struggle:${body.documentId}:${body.versionId}:${contentHash}`;
	const cached = await getCachedJson(c.env, cacheKey, detectStruggleResponseSchema);
	if (cached) {
		return c.json({ ...cached, cached: true });
	}

	const fallback = noStruggleResponse();
	try {
		const raw = await runAiText(c.env, buildDetectStrugglePrompt(body, currentText, previousText, evidence), 700);
		const result = normalizeAiJsonOutput(raw, detectStruggleResponseSchema, fallback);
		const conservativeResult: DetectStruggleResponse = result.confidence < 0.55
			? { ...result, struggleDetected: false, concepts: [], recommendedAction: 'none' }
			: {
				...result,
				concepts: result.concepts.slice(0, 3).map((concept) => ({
					...concept,
					evidence: concept.evidence.slice(0, 3),
				})),
			};

		await putCachedJson(c.env, cacheKey, conservativeResult);
		return c.json(conservativeResult);
	} catch (error) {
		log('Struggle detection failed', { error: String(error) });
		return errorResponse(c, 'Struggle detection failed', 500, String(error));
	}
});

studyRoute.post('/study-explanation', async (c) => {
	const body = await parseJsonBody(c, studyExplanationRequestSchema);
	if (body instanceof Response) {
		return body;
	}
	const input: StudyExplanationRequest = {
		...body,
		documentContext: body.documentContext ?? '',
		teamDebate: body.teamDebate ?? [],
	};

	try {
		const raw = await runAiText(c.env, buildStudyExplanationPrompt(input), 600);
		const fallback: StudyExplanationResponse = {
			concept: input.concept,
			explanation: `This section may show confusion around ${input.concept}. Review the document context and connect the concept to the team's final wording.`,
			simpleExample: `Use one sentence from your document to explain ${input.concept} in simpler words.`,
			socraticQuestion: `What changed in your team's explanation of ${input.concept}, and why?`,
			commonMisconception: `A common issue is treating ${input.concept} as a memorized term instead of explaining how it works in this assignment.`,
		};

		return c.json(normalizeAiJsonOutput(raw, studyExplanationResponseSchema, fallback));
	} catch (error) {
		log('Study explanation failed', { error: String(error) });
		return errorResponse(c, 'Study explanation failed', 500, String(error));
	}
});

studyRoute.post('/generate-study-replay', async (c) => {
	const body = await parseJsonBody(c, generateStudyReplayRequestSchema);
	if (body instanceof Response) {
		return body;
	}

	const latestVersionId = body.versions[body.versions.length - 1]?.versionId ?? 'none';
	const struggleHash = await hashCacheKey([JSON.stringify(body.struggleMoments)]);
	const cacheKey = `study-replay:${body.documentId}:${latestVersionId}:${struggleHash}`;
	const cached = await getCachedJson(c.env, cacheKey, studyReplayResponseSchema);
	if (cached) {
		return c.json({ ...cached, cached: true });
	}

	const replayContext = buildReplayContext(body);
	const fallback = fallbackStudyReplay(body);

	try {
		const raw = await runAiText(c.env, buildStudyReplayPrompt(body, replayContext), 1400);
		const result = normalizeAiJsonOutput(raw, studyReplayResponseSchema, fallback);
		const limitedResult: StudyReplayResponse = {
			...result,
			conceptsToReview: result.conceptsToReview.slice(0, 5),
			studyPlan: result.studyPlan.slice(0, 5).map((item, index) => ({ ...item, step: index + 1 })),
		};

		await putCachedJson(c.env, cacheKey, limitedResult);
		return c.json(limitedResult);
	} catch (error) {
		log('Study replay generation failed', { error: String(error) });
		return errorResponse(c, 'Study replay generation failed', 500, String(error));
	}
});
