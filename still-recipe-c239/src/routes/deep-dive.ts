import { Hono } from 'hono';
import {
	DEEP_DIVE_CACHE_TTL_SECONDS,
	MAX_DEEP_DIVE_DOCUMENT_CONTEXT_LENGTH,
	MAX_DEEP_DIVE_REPLAY_VERSIONS,
	MAX_DEEP_DIVE_VERSION_CONTENT_LENGTH,
} from '../config';
import { runAiText } from '../lib/ai';
import { parseBlockNoteToPlainText } from '../lib/blocknote';
import { getCachedJson, hashCacheKey, putCachedJson } from '../lib/cache';
import { errorResponse, log, parseJsonBody } from '../lib/http';
import { normalizeAiJsonOutputWithStatus } from '../lib/json';
import { buildConceptDeepDivePrompt } from '../lib/prompts';
import {
	conceptDeepDiveAiResponseSchema,
	conceptDeepDiveRequestSchema,
} from '../schemas';
import type {
	AppContext,
	Bindings,
	ChangeSummary,
	ConceptDeepDiveRequest,
	ConceptDeepDiveResponse,
	StruggleSignal,
} from '../types';

export const deepDiveRoute = new Hono<{ Bindings: Bindings }>();

type NormalizedVersion = ConceptDeepDiveRequest['replayContext']['versions'][number] & {
	text: string;
	score: number;
};

const REVISION_NARRATIVE_PATTERN = /\b(revision|revised|confusion|unclear|feedback|correction|corrected|changed|debate|question)\b/i;

function normalizeTerm(value: string): string {
	return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

function includesConcept(text: string, concept: string): boolean {
	return normalizeTerm(text).includes(normalizeTerm(concept));
}

function summarizeChanges(summary?: ChangeSummary): string {
	if (!summary) {
		return 'none';
	}

	return `added ${summary.addedBlocks}, updated ${summary.updatedBlocks}, removed ${summary.removedBlocks}`;
}

function signalsForVersion(input: ConceptDeepDiveRequest, versionId: string) {
	return (input.replayContext.struggleSignals ?? [])
		.filter((signal) => signal.versionId === versionId)
		.map((signal) => ({
			...signal,
			evidence: signal.evidence.slice(0, 10),
		}));
}

function signalLabel(signal: StruggleSignal): string {
	return signal.replace(/_/g, ' ');
}

function scoreVersion(input: ConceptDeepDiveRequest, text: string, version: ConceptDeepDiveRequest['replayContext']['versions'][number]): number {
	const summary = version.summary;
	const signals = signalsForVersion(input, version.versionId);
	let score = 0;

	if (includesConcept(text, input.concept)) {
		score += 50;
	}
	if (signals.length > 0) {
		score += 40 + signals.length * 8;
	}
	if (summary) {
		score += summary.updatedBlocks * 4 + summary.removedBlocks * 5 + summary.addedBlocks;
	}
	if (version.aiNarrative && REVISION_NARRATIVE_PATTERN.test(version.aiNarrative)) {
		score += 15;
	}

	return score;
}

function rankVersions(input: ConceptDeepDiveRequest): NormalizedVersion[] {
	return input.replayContext.versions
		.map((version) => {
			const text = parseBlockNoteToPlainText(version.content, MAX_DEEP_DIVE_VERSION_CONTENT_LENGTH);
			return {
				...version,
				text,
				score: scoreVersion(input, text, version),
			};
		})
		.sort((a, b) => {
			if (b.score !== a.score) {
				return b.score - a.score;
			}
			return Date.parse(b.timestamp) - Date.parse(a.timestamp);
		})
		.slice(0, MAX_DEEP_DIVE_REPLAY_VERSIONS);
}

function collectEvidence(input: ConceptDeepDiveRequest, versions: NormalizedVersion[]): string[] {
	const versionIds = new Set(versions.map((version) => version.versionId));
	const signalEvidence = (input.replayContext.struggleSignals ?? [])
		.filter((signal) => versionIds.has(signal.versionId))
		.flatMap((signal) => signal.evidence.slice(0, 10));
	const debateEvidence = (input.replayContext.teamDebate ?? [])
		.slice(0, 20)
		.map((item) => item.text)
		.filter((text) => includesConcept(text, input.concept));

	return [...new Set([...signalEvidence, ...debateEvidence])].slice(0, 10);
}

function hasUsefulEvidence(input: ConceptDeepDiveRequest, documentContext: string, versions: NormalizedVersion[]): boolean {
	if (includesConcept(documentContext, input.concept)) {
		return true;
	}
	if (versions.some((version) => version.score > 0 && includesConcept(version.text, input.concept))) {
		return true;
	}
	if ((input.replayContext.struggleSignals ?? []).length > 0) {
		return true;
	}
	return (input.replayContext.teamDebate ?? []).some((item) => includesConcept(item.text, input.concept));
}

function buildReplayDigest(input: ConceptDeepDiveRequest, versions: NormalizedVersion[]): string {
	const debate = (input.replayContext.teamDebate ?? [])
		.slice(0, 20)
		.map((item) => {
			const author = item.authorName ? `${item.authorName}: ` : '';
			const timestamp = item.timestamp ? ` (${item.timestamp})` : '';
			return `- ${author}${item.text}${timestamp}`;
		})
		.join('\n');

	const versionDigest = versions.map((version) => {
		const signals = signalsForVersion(input, version.versionId);
		const signalText = signals.length > 0
			? signals
				.map((signal) => `${signalLabel(signal.signal)}: ${signal.evidence.join(' | ')}`)
				.join('; ')
			: 'none';
		const excerpt = version.text.slice(0, 600);

		return `Version ${version.versionId}
Timestamp: ${version.timestamp}
Change summary: ${summarizeChanges(version.summary)}
AI narrative: ${version.aiNarrative ?? 'none'}
Struggle signal evidence: ${signalText}
Excerpt: ${excerpt}`;
	}).join('\n\n');

	return `Relevant versions:
${versionDigest}

Team debate:
${debate || 'none'}`;
}

function fallbackDeepDive(
	input: ConceptDeepDiveRequest,
	versions: NormalizedVersion[],
	documentContext: string,
	confidence: number,
	processingTime: number,
): ConceptDeepDiveResponse {
	const evidence = collectEvidence(input, versions);
	const topVersion = versions[0];
	const hasEvidence = evidence.length > 0 || includesConcept(documentContext, input.concept) || versions.some((version) => includesConcept(version.text, input.concept));
	const masteryLevel = confidence >= 0.72 ? 'advanced' : confidence >= 0.45 ? 'developing' : 'foundational';
	const includeMisconceptions = input.options?.includeMisconceptions !== false;
	const includePractice = input.options?.includePracticeQuestions !== false;
	const includeResearch = input.options?.includeResearchDirections !== false || input.depth === 'research';

	return {
		concept: input.concept,
		...(input.subject ? { subject: input.subject } : {}),
		masteryLevel,
		confidence,
		whyThisConceptMatters: hasEvidence
			? `The replay suggests ${input.concept} needed more attention because it appeared near revision, debate, or evidence changes in the project history.`
			: `The provided project history has limited evidence for ${input.concept}, so this report should be treated as a starting point for review.`,
		whereItAppeared: topVersion ? [{
			versionId: topVersion.versionId,
			reason: hasEvidence
				? 'This replay checkpoint had the strongest available relevance based on concept mentions, revision activity, or struggle signals.'
				: 'This is the available checkpoint, but it has limited direct evidence for the requested concept.',
			evidence: evidence.slice(0, 5),
		}] : [],
		groundedExplanation: {
			shortExplanation: `${input.concept} is the focus concept for this deep dive. Use the project context to define it precisely before applying it.`,
			deeperExplanation: `Review how ${input.concept} appears in the document history, then separate the definition, the evidence used in the project, and the conclusion the team wants to support.`,
			projectSpecificConnection: hasEvidence
				? `Your project history becomes your mastery path here: the replay gives concrete checkpoints for reviewing how ${input.concept} was introduced, revised, or debated.`
				: `The current request does not provide much direct project evidence for ${input.concept}; add a replay checkpoint or team note where the concept appears for a stronger deep dive.`,
			simpleExample: `Write one sentence that explains ${input.concept}, then point to the exact project sentence where it is used.`,
		},
		misconceptionCheck: includeMisconceptions ? [{
			misconception: `${input.concept} can be understood by memorizing a short definition only.`,
			whyItIsWrong: 'A definition is useful, but mastery requires knowing how the concept changes the interpretation of the project evidence.',
			howToFixThinking: 'Connect the concept to a specific claim, example, or revision in the document history.',
		}] : [],
		deepQuestions: [{
			question: `How does ${input.concept} change the way your project evidence should be interpreted?`,
			whyThisQuestionMatters: 'This checks whether the concept is being used as reasoning rather than as a label.',
			expectedReasoningPath: [
				'Define the concept in your own words',
				'Identify where it appears in the project',
				'Explain what claim or interpretation depends on it',
			],
		}],
		practiceQuestions: includePractice ? [{
			difficulty: input.depth === 'standard' ? 'medium' : 'hard',
			question: `Explain ${input.concept} using one sentence from your project as evidence.`,
			answerGuide: 'A strong answer gives a clear definition, points to project-specific evidence, and avoids claims not supported by the replay context.',
		}] : [],
		researchDirections: includeResearch ? [{
			title: `${input.concept} deeper explanation`,
			whyExploreThis: 'Use this search to compare your project-specific explanation with a broader academic explanation.',
			searchQuery: `${input.subject ?? ''} ${input.concept} explanation common misconceptions`.trim(),
		}] : [],
		nextStudyStep: `Rewrite the project explanation of ${input.concept} in your own words, then compare it with the strongest replay checkpoint.`,
		processingTime,
		cached: false,
	};
}

function addDeepDiveHeaders(c: AppContext) {
	c.header('Cache-Control', 'private, max-age=60');
	c.header('X-Content-Type-Options', 'nosniff');
}

function stripResponseMetadata(response: ConceptDeepDiveResponse) {
	const { processingTime: _processingTime, cached: _cached, ...aiResponse } = response;
	return aiResponse;
}

function applyOutputOptions(input: ConceptDeepDiveRequest, response: ConceptDeepDiveResponse): ConceptDeepDiveResponse {
	return {
		...response,
		whereItAppeared: response.whereItAppeared.slice(0, 8).map((item) => ({
			...item,
			evidence: item.evidence.slice(0, 5),
		})),
		misconceptionCheck: input.options?.includeMisconceptions === false ? [] : response.misconceptionCheck.slice(0, 3),
		deepQuestions: response.deepQuestions.slice(0, input.depth === 'standard' ? 2 : 3),
		practiceQuestions: input.options?.includePracticeQuestions === false ? [] : response.practiceQuestions.slice(0, 5),
		researchDirections: input.options?.includeResearchDirections === false ? [] : response.researchDirections.slice(0, 5),
	};
}

deepDiveRoute.post('/concept-deep-dive', async (c) => {
	const startedAt = Date.now();
	const body = await parseJsonBody(c, conceptDeepDiveRequestSchema);
	if (body instanceof Response) {
		return body;
	}

	const documentContext = parseBlockNoteToPlainText(body.documentContext, MAX_DEEP_DIVE_DOCUMENT_CONTEXT_LENGTH);
	const rankedVersions = rankVersions(body);
	const latestRelevantVersion = [...rankedVersions]
		.sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp))[0];
	const signalsHash = await hashCacheKey([
		JSON.stringify(body.replayContext.struggleSignals ?? []),
		JSON.stringify((body.replayContext.teamDebate ?? []).slice(0, 20)),
	]);
	const contextHash = await hashCacheKey([documentContext]);
	const latestVersionHash = await hashCacheKey([latestRelevantVersion?.content ?? '']);
	const cacheKey = `concept-deep-dive:${body.documentId}:${normalizeTerm(body.concept)}:${body.studentLevel}:${body.depth}:${contextHash}:${latestVersionHash}:${signalsHash}`;

	addDeepDiveHeaders(c);

	const cached = await getCachedJson(c.env, cacheKey, conceptDeepDiveAiResponseSchema);
	if (cached) {
		const processingTime = Date.now() - startedAt;
		log('Concept deep dive cache hit', {
			endpoint: 'concept-deep-dive',
			documentId: body.documentId,
			concept: body.concept,
			processingTime,
			cache: 'hit',
			validation: 'cached',
		});
		return c.json({ ...cached, processingTime, cached: true });
	}

	if (!hasUsefulEvidence(body, documentContext, rankedVersions)) {
		const processingTime = Date.now() - startedAt;
		const fallback = fallbackDeepDive(body, rankedVersions, documentContext, 0.28, processingTime);
		log('Concept deep dive weak evidence fallback', {
			endpoint: 'concept-deep-dive',
			documentId: body.documentId,
			concept: body.concept,
			processingTime,
			cache: 'miss',
			validation: 'fallback',
		});
		return c.json(fallback);
	}

	const replayDigest = buildReplayDigest(body, rankedVersions);
	const fallback = fallbackDeepDive(body, rankedVersions, documentContext, 0.62, Date.now() - startedAt);

	try {
		const raw = await runAiText(c.env, buildConceptDeepDivePrompt(body, documentContext, replayDigest), 1800);
		const normalized = normalizeAiJsonOutputWithStatus(raw, conceptDeepDiveAiResponseSchema, stripResponseMetadata(fallback));
		const parsed = normalized.data;
		const processingTime = Date.now() - startedAt;
		const result = applyOutputOptions(body, {
			...parsed,
			concept: body.concept,
			...(body.subject ? { subject: body.subject } : {}),
			confidence: Math.max(0, Math.min(1, parsed.confidence)),
			processingTime,
			cached: false,
		});

		await putCachedJson(c.env, cacheKey, stripResponseMetadata(result), DEEP_DIVE_CACHE_TTL_SECONDS[body.depth]);
		log('Concept deep dive generated', {
			endpoint: 'concept-deep-dive',
			documentId: body.documentId,
			concept: body.concept,
			processingTime,
			cache: 'miss',
			validation: normalized.valid ? 'ok' : 'fallback',
		});
		return c.json(result);
	} catch (error) {
		const processingTime = Date.now() - startedAt;
		const result = applyOutputOptions(body, fallbackDeepDive(body, rankedVersions, documentContext, 0.58, processingTime));
		log('Concept deep dive AI fallback', {
			endpoint: 'concept-deep-dive',
			documentId: body.documentId,
			concept: body.concept,
			processingTime,
			cache: 'miss',
			validation: 'fallback',
			error: String(error),
		});
		return c.json(result);
	}
});
