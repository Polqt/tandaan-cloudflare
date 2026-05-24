import { Hono, type Context, type Next } from 'hono';
import { z } from 'zod';

// =============================================================================
// TYPES & BINDINGS
// =============================================================================

type Bindings = {
	AI: Ai;
	API_SECRET: string;
	ALLOWED_ORIGIN?: string;
	CACHE?: KVNamespace;
};

type ChangeSummary = {
	addedBlocks: number;
	updatedBlocks: number;
	removedBlocks: number;
};

type Difficulty = 'basic' | 'intermediate' | 'advanced';
type RecommendedAction = 'none' | 'show_explanation' | 'save_for_study_replay';
type StudentLevel = 'beginner' | 'intermediate' | 'advanced';

export type DetectStruggleRequest = {
	documentId: string;
	versionId: string;
	currentContent: string;
	previousContent: string | null;
	changeSummary: ChangeSummary;
	context?: {
		courseOrSubject?: string;
		assignmentTitle?: string;
		recentComments?: string[];
		recentContributorNames?: string[];
	};
};

export type DetectedConcept = {
	name: string;
	reason: string;
	evidence: string[];
	difficulty: Difficulty;
};

export type DetectStruggleResponse = {
	struggleDetected: boolean;
	confidence: number;
	concepts: DetectedConcept[];
	recommendedAction: RecommendedAction;
};

export type StudyExplanationRequest = {
	concept: string;
	difficulty: Difficulty;
	documentContext: string;
	teamDebate: string[];
	studentLevel: StudentLevel;
};

export type StudyExplanationResponse = {
	concept: string;
	explanation: string;
	simpleExample: string;
	socraticQuestion: string;
	commonMisconception: string;
};

export type GenerateStudyReplayRequest = {
	documentId: string;
	title: string;
	subject?: string;
	versions: Array<{
		versionId: string;
		content: string;
		summary: ChangeSummary;
		aiNarrative?: string;
		timestamp: string;
	}>;
	struggleMoments: Array<{
		versionId: string;
		concepts: string[];
		evidence: string[];
	}>;
};

export type StudyReplayResponse = {
	title: string;
	overview: string;
	conceptsToReview: Array<{
		concept: string;
		whyItMatters: string;
		whereItAppeared: string[];
		explanation: string;
		practiceQuestions: string[];
		teamDebateSummary: string;
	}>;
	studyPlan: Array<{
		step: number;
		task: string;
	}>;
};

type AiMessage = {
	role: 'system' | 'user';
	content: string;
};

type AppContext = Context<{ Bindings: Bindings }>;

// =============================================================================
// ZOD SCHEMAS
// =============================================================================

const changeSummarySchema = z.object({
	addedBlocks: z.number().int().min(0),
	updatedBlocks: z.number().int().min(0),
	removedBlocks: z.number().int().min(0),
});

const versionSchema = z.object({
	content: z.string(),
	summary: changeSummarySchema,
	timestamp: z.string().datetime(),
});

const versionSummaryRequestSchema = z.object({
	currentVersion: versionSchema,
	previousVersion: versionSchema.nullable(),
	documentTitle: z.string().min(1).max(200),
});

const translationRequestSchema = z.object({
	text: z.string().min(1).max(10000),
	targetLanguage: z.string().min(2).max(50),
	sourceLanguage: z.string().optional(),
});

const batchTranslationRequestSchema = z.object({
	documents: z.array(z.object({
		id: z.string(),
		text: z.string().min(1).max(10000),
	})).min(1).max(10),
	targetLanguage: z.string().min(2).max(50),
});

const languageDetectionRequestSchema = z.object({
	text: z.string().min(1).max(5000),
});

const suggestionRequestSchema = z.object({
	context: z.string().min(1).max(2000),
	documentTitle: z.string().optional(),
});

const detectStruggleRequestSchema = z.object({
	documentId: z.string().min(1).max(200),
	versionId: z.string().min(1).max(200),
	currentContent: z.string().min(1),
	previousContent: z.string().nullable(),
	changeSummary: changeSummarySchema,
	context: z.object({
		courseOrSubject: z.string().max(120).optional(),
		assignmentTitle: z.string().max(200).optional(),
		recentComments: z.array(z.string().max(500)).max(20).default([]),
		recentContributorNames: z.array(z.string().max(120)).max(20).default([]),
	}).optional(),
});

const detectedConceptSchema = z.object({
	name: z.string(),
	reason: z.string(),
	evidence: z.array(z.string()).max(5),
	difficulty: z.enum(['basic', 'intermediate', 'advanced']),
});

const detectStruggleResponseSchema = z.object({
	struggleDetected: z.boolean(),
	confidence: z.number().min(0).max(1),
	concepts: z.array(detectedConceptSchema).max(3),
	recommendedAction: z.enum(['none', 'show_explanation', 'save_for_study_replay']),
});

const studyExplanationRequestSchema = z.object({
	concept: z.string().min(1).max(120),
	difficulty: z.enum(['basic', 'intermediate', 'advanced']),
	documentContext: z.string().max(8000).default(''),
	teamDebate: z.array(z.string().max(500)).max(20).default([]),
	studentLevel: z.enum(['beginner', 'intermediate', 'advanced']),
});

const studyExplanationResponseSchema = z.object({
	concept: z.string(),
	explanation: z.string(),
	simpleExample: z.string(),
	socraticQuestion: z.string(),
	commonMisconception: z.string(),
});

const generateStudyReplayRequestSchema = z.object({
	documentId: z.string().min(1).max(200),
	title: z.string().min(1).max(200),
	subject: z.string().max(120).optional(),
	versions: z.array(z.object({
		versionId: z.string().min(1).max(200),
		content: z.string().min(1),
		summary: changeSummarySchema,
		aiNarrative: z.string().max(1000).optional(),
		timestamp: z.string().datetime(),
	})).min(1).max(50),
	struggleMoments: z.array(z.object({
		versionId: z.string().min(1).max(200),
		concepts: z.array(z.string().min(1).max(120)).max(10),
		evidence: z.array(z.string().max(500)).max(10),
	})).max(50),
});

const studyReplayResponseSchema = z.object({
	title: z.string(),
	overview: z.string(),
	conceptsToReview: z.array(z.object({
		concept: z.string(),
		whyItMatters: z.string(),
		whereItAppeared: z.array(z.string()),
		explanation: z.string(),
		practiceQuestions: z.array(z.string()).min(1).max(3),
		teamDebateSummary: z.string(),
	})).max(5),
	studyPlan: z.array(z.object({
		step: z.number().int().min(1),
		task: z.string(),
	})).min(1).max(5),
});

// =============================================================================
// CONSTANTS
// =============================================================================

const MAX_CONTENT_LENGTH = 4000;
const MAX_REPLAY_CONTEXT_LENGTH = 9000;
const CACHE_TTL_SECONDS = 60 * 60 * 24;
const AI_MODEL = '@cf/meta/llama-3.1-8b-instruct' as keyof AiModels;

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function log(c: AppContext, message: string, data?: Record<string, unknown>) {
	console.log(JSON.stringify({
		timestamp: new Date().toISOString(),
		service: 'tandaan-replay-ai',
		message,
		...data,
	}));
}

function errorResponse(c: AppContext, error: string, status: 400 | 401 | 404 | 500, details?: unknown) {
	return c.json({ error, ...(details ? { details } : {}) }, status);
}

async function parseJsonBody<T>(c: AppContext, schema: z.ZodType<T>): Promise<T | Response> {
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

function extractTextFromContent(content: unknown): string {
	if (typeof content === 'string') {
		return content;
	}

	if (Array.isArray(content)) {
		return content.map(extractTextFromContent).join(' ');
	}

	if (content && typeof content === 'object') {
		const record = content as Record<string, unknown>;
		const directText = typeof record.text === 'string' ? record.text : '';
		const nestedContent = record.content ? extractTextFromContent(record.content) : '';
		const children = record.children ? extractTextFromContent(record.children) : '';
		return [directText, nestedContent, children].filter(Boolean).join(' ');
	}

	return '';
}

/**
 * Parse BlockNote JSON into plain text. Invalid JSON is treated as plain text.
 */
function parseBlockNoteToPlainText(blockNoteJson: string, maxLength = MAX_CONTENT_LENGTH): string {
	try {
		const parsed = JSON.parse(blockNoteJson);
		const text = extractTextFromContent(parsed).replace(/\s+/g, ' ').trim();
		return (text || blockNoteJson).slice(0, maxLength);
	} catch {
		return blockNoteJson.replace(/\s+/g, ' ').trim().slice(0, maxLength);
	}
}

async function hashCacheKey(parts: Array<string | null | undefined>): Promise<string> {
	const input = parts.map((part) => part ?? '').join('\u001f');
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
	return [...new Uint8Array(digest)]
		.map((byte) => byte.toString(16).padStart(2, '0'))
		.join('');
}

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

function normalizeAiJsonOutput<T>(raw: string, schema: z.ZodType<T>, fallback: T): T {
	const parsed = extractJsonObject(raw);
	const result = schema.safeParse(parsed);
	return result.success ? result.data : fallback;
}

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

async function runAiText(env: Bindings, messages: AiMessage[], maxTokens: number): Promise<string> {
	const response = await env.AI.run(AI_MODEL, {
		messages,
		max_tokens: maxTokens,
	});

	return getAiText(response);
}

async function getCachedJson<T>(env: Bindings, cacheKey: string, schema: z.ZodType<T>): Promise<T | null> {
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

async function putCachedJson(env: Bindings, cacheKey: string, value: unknown) {
	if (!env.CACHE) {
		return;
	}

	try {
		await env.CACHE.put(cacheKey, JSON.stringify(value), { expirationTtl: CACHE_TTL_SECONDS });
	} catch {
		// Cache is an optimization only.
	}
}

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

function createNoStruggleResponse(evidence: string[] = []): DetectStruggleResponse {
	return {
		struggleDetected: false,
		confidence: 0.25,
		concepts: evidence.length > 0 ? [] : [],
		recommendedAction: 'none',
	};
}

function determineChapterLabel(previousSummary: ChangeSummary | null, currentSummary: ChangeSummary): string {
	if (previousSummary === null) {
		return 'First draft';
	}

	const totalChanges = currentSummary.addedBlocks + currentSummary.updatedBlocks + currentSummary.removedBlocks;
	if (totalChanges > 20 || currentSummary.updatedBlocks > 10) {
		return 'Major revision';
	}
	if (currentSummary.addedBlocks > currentSummary.updatedBlocks && currentSummary.addedBlocks > 5) {
		return 'After feedback';
	}
	if (totalChanges <= 5) {
		return 'Incremental edit';
	}

	return 'Initial edit';
}

function generateSummaryPrompt(
	currentText: string,
	previousText: string | null,
	currentSummary: ChangeSummary,
	documentTitle: string,
): string {
	if (previousText === null) {
		return `You are a document version historian. Generate a 2-4 sentence narrative summary for the first version of "${documentTitle}". The document contains ${currentSummary.addedBlocks} new content blocks.

Document content preview:
${currentText}`;
	}

	return `You are a document version historian. Generate a 2-4 sentence narrative summary explaining what changed in "${documentTitle}".

CHANGES SUMMARY:
- Added: ${currentSummary.addedBlocks} blocks
- Updated: ${currentSummary.updatedBlocks} blocks
- Removed: ${currentSummary.removedBlocks} blocks

PREVIOUS VERSION PREVIEW:
${previousText}

CURRENT VERSION PREVIEW:
${currentText}`;
}

function buildDetectStrugglePrompt(input: DetectStruggleRequest, currentText: string, previousText: string | null, evidence: string[]): AiMessage[] {
	return [
		{
			role: 'system',
			content: `You detect conceptual struggle in collaborative document replay moments. This is not a chatbot and not a student diagnosis.
Prefer false negatives over annoying false positives. Only use evidence from the provided document, change summary, and comments.
Return compact JSON only with this shape:
{"struggleDetected":boolean,"confidence":number,"concepts":[{"name":"string","reason":"string","evidence":["string"],"difficulty":"basic|intermediate|advanced"}],"recommendedAction":"none|show_explanation|save_for_study_replay"}`,
		},
		{
			role: 'user',
			content: `Document: ${input.documentId}
Version: ${input.versionId}
Subject: ${input.context?.courseOrSubject ?? 'unknown'}
Assignment: ${input.context?.assignmentTitle ?? 'unknown'}
Change summary: ${JSON.stringify(input.changeSummary)}

Potential friction evidence:
${evidence.map((item) => `- ${item}`).join('\n') || '- none'}

Recent comments:
${(input.context?.recentComments ?? []).map((item) => `- ${item}`).join('\n') || '- none'}

Previous content:
${previousText ?? 'none'}

Current content:
${currentText}

Detect only conceptual struggle such as repeated rewrites, definition changes, debate-like wording, large replacement edits, unclear explanations, or conflicting statements. Avoid personal judgments.`,
		},
	];
}

function buildStudyExplanationPrompt(input: StudyExplanationRequest): AiMessage[] {
	return [
		{
			role: 'system',
			content: `You are Tandaan's AI Study Buddy. Explain concepts from the student's actual document and team debate, not as a generic textbook answer.
Keep answers short, study-friendly, grounded, and cautious when context is thin. Return JSON only:
{"concept":"string","explanation":"string","simpleExample":"string","socraticQuestion":"string","commonMisconception":"string"}`,
		},
		{
			role: 'user',
			content: `Concept: ${input.concept}
Difficulty: ${input.difficulty}
Student level: ${input.studentLevel}

Document context:
${input.documentContext.slice(0, MAX_CONTENT_LENGTH)}

Team debate:
${input.teamDebate.map((item) => `- ${item}`).join('\n') || '- none'}

Use the document/team context when available. Do not claim certainty about what any individual student understands.`,
		},
	];
}

function buildStudyReplayPrompt(input: GenerateStudyReplayRequest, replayContext: string): AiMessage[] {
	return [
		{
			role: 'system',
			content: `You generate Tandaan Study Replay guides from collaboration history. Prioritize concepts with strong struggle evidence.
This is not a generic study guide. Ground every concept in replay context, limit to top 5 concepts, and avoid diagnosing students.
Return JSON only:
{"title":"string","overview":"string","conceptsToReview":[{"concept":"string","whyItMatters":"string","whereItAppeared":["versionId"],"explanation":"string","practiceQuestions":["string"],"teamDebateSummary":"string"}],"studyPlan":[{"step":number,"task":"string"}]}`,
		},
		{
			role: 'user',
			content: `Title: ${input.title}
Subject: ${input.subject ?? 'unknown'}

Replay context:
${replayContext}

Generate a concise post-project study guide from the actual replay moments.`,
		},
	];
}

function buildReplayContext(input: GenerateStudyReplayRequest): string {
	const versionText = input.versions
		.slice(-8)
		.map((version) => {
			const text = parseBlockNoteToPlainText(version.content, 900);
			return `Version ${version.versionId} (${version.timestamp})
Changes: ${JSON.stringify(version.summary)}
AI narrative: ${version.aiNarrative ?? 'none'}
Content: ${text}`;
		})
		.join('\n\n');

	const struggleText = input.struggleMoments
		.map((moment) => `Version ${moment.versionId}
Concepts: ${moment.concepts.join(', ')}
Evidence: ${moment.evidence.join(' | ')}`)
		.join('\n\n');

	return `Versions:
${versionText}

Struggle moments:
${struggleText || 'none'}`.slice(0, MAX_REPLAY_CONTEXT_LENGTH);
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

// =============================================================================
// MIDDLEWARE
// =============================================================================

async function authMiddleware(c: AppContext, next: Next) {
	const apiKey = c.req.header('x-api-key');

	if (!apiKey) {
		return errorResponse(c, 'Missing x-api-key header', 401);
	}
	if (apiKey !== c.env.API_SECRET) {
		return errorResponse(c, 'Invalid API key', 401);
	}

	return next();
}

async function corsMiddleware(c: AppContext, next: Next) {
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

// =============================================================================
// APP SETUP
// =============================================================================

const app = new Hono<{ Bindings: Bindings }>();

app.use('*', corsMiddleware);
app.use('*', authMiddleware);

app.get('/health', (c) => {
	c.res.headers.set('Cache-Control', 'public, max-age=60');
	return c.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.post('/generate-summary', async (c) => {
	const startTime = Date.now();
	const body = await parseJsonBody(c, versionSummaryRequestSchema);
	if (body instanceof Response) {
		return body;
	}

	const { currentVersion, previousVersion, documentTitle } = body;
	const currentText = parseBlockNoteToPlainText(currentVersion.content);
	const previousText = previousVersion ? parseBlockNoteToPlainText(previousVersion.content) : null;
	const prompt = generateSummaryPrompt(currentText, previousText, currentVersion.summary, documentTitle);

	try {
		const aiSummary = await runAiText(c.env, [
			{
				role: 'system',
				content: 'You generate concise, informative document change summaries. Always respond with 2-4 sentences maximum.',
			},
			{ role: 'user', content: prompt },
		], 300);
		const chapterLabel = determineChapterLabel(previousVersion?.summary ?? null, currentVersion.summary);
		const tokensUsed = Math.ceil((prompt.length + aiSummary.length) / 4);

		log(c, 'Summary generated successfully', {
			documentTitle,
			tokensUsed,
			processingTime: Date.now() - startTime,
			chapterLabel,
		});

		const response = c.json({
			aiSummary: aiSummary || 'Summary could not be generated.',
			chapterLabel,
			tokensUsed,
		});
		response.headers.set('Cache-Control', 'private, max-age=30');
		response.headers.set('X-Content-Type-Options', 'nosniff');
		return response;
	} catch (error) {
		log(c, 'AI generation failed', { error: String(error) });
		return errorResponse(c, 'AI generation failed', 500, String(error));
	}
});

app.post('/translate', async (c) => {
	const startTime = Date.now();
	const body = await parseJsonBody(c, translationRequestSchema);
	if (body instanceof Response) {
		return body;
	}

	const { text, targetLanguage, sourceLanguage } = body;
	const textHash = await hashCacheKey([text, targetLanguage, sourceLanguage ?? 'auto']);
	const cacheKey = `translate:${textHash}`;
	const cached = await getCachedJson(c.env, cacheKey, z.object({
		originalText: z.string(),
		translatedText: z.string(),
		detectedLanguage: z.string(),
		targetLanguage: z.string(),
	}));
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
		log(c, 'Translation failed', { error: String(error) });
		return errorResponse(c, 'Translation failed', 500, String(error));
	}
});

app.post('/batch-translate', async (c) => {
	const startTime = Date.now();
	const body = await parseJsonBody(c, batchTranslationRequestSchema);
	if (body instanceof Response) {
		return body;
	}

	const results = await Promise.all(body.documents.map(async (doc) => {
		const cacheKey = `batch:${await hashCacheKey([doc.text, body.targetLanguage])}`;
		const cached = await getCachedJson(c.env, cacheKey, z.object({ translatedText: z.string() }));
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

	log(c, 'Batch translation completed', { count: results.length, targetLanguage: body.targetLanguage });
	return c.json({
		results,
		processingTime: Date.now() - startTime,
		totalDocuments: body.documents.length,
		processedCount: results.length,
	});
});

app.post('/detect-language', async (c) => {
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

app.get('/suggest', async (c) => {
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

app.post('/suggest', async (c) => {
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

// =============================================================================
// STUDY REPLAY / AI STUDY BUDDY ENDPOINTS
// =============================================================================

app.post('/detect-struggle', async (c) => {
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
		return c.json(createNoStruggleResponse(evidence));
	}

	const contentHash = await hashCacheKey([body.currentContent, body.previousContent ?? '']);
	const cacheKey = `detect-struggle:${body.documentId}:${body.versionId}:${contentHash}`;
	const cached = await getCachedJson(c.env, cacheKey, detectStruggleResponseSchema);
	if (cached) {
		return c.json({ ...cached, cached: true });
	}

	const fallback: DetectStruggleResponse = createNoStruggleResponse(evidence);
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
		log(c, 'Struggle detection failed', { error: String(error) });
		return errorResponse(c, 'Struggle detection failed', 500, String(error));
	}
});

app.post('/study-explanation', async (c) => {
	const body = await parseJsonBody(c, studyExplanationRequestSchema);
	if (body instanceof Response) {
		return body;
	}

	try {
		const raw = await runAiText(c.env, buildStudyExplanationPrompt(body), 600);
		const fallback: StudyExplanationResponse = {
			concept: body.concept,
			explanation: `This section may show confusion around ${body.concept}. Review the document context and connect the concept to the team's final wording.`,
			simpleExample: `Use one sentence from your document to explain ${body.concept} in simpler words.`,
			socraticQuestion: `What changed in your team's explanation of ${body.concept}, and why?`,
			commonMisconception: `A common issue is treating ${body.concept} as a memorized term instead of explaining how it works in this assignment.`,
		};

		return c.json(normalizeAiJsonOutput(raw, studyExplanationResponseSchema, fallback));
	} catch (error) {
		log(c, 'Study explanation failed', { error: String(error) });
		return errorResponse(c, 'Study explanation failed', 500, String(error));
	}
});

app.post('/generate-study-replay', async (c) => {
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
		log(c, 'Study replay generation failed', { error: String(error) });
		return errorResponse(c, 'Study replay generation failed', 500, String(error));
	}
});

app.onError((err, c) => {
	log(c, 'Unhandled error', { error: String(err), stack: err.stack });
	return c.json({ error: 'Internal server error', message: err.message }, 500);
});

app.notFound((c) => c.json({ error: 'Not found' }, 404));

export default app;
