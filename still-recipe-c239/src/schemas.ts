import { z } from 'zod';

export const changeSummarySchema = z.object({
	addedBlocks: z.number().int().min(0),
	updatedBlocks: z.number().int().min(0),
	removedBlocks: z.number().int().min(0),
});

const versionSchema = z.object({
	content: z.string(),
	summary: changeSummarySchema,
	timestamp: z.string().datetime(),
});

export const versionSummaryRequestSchema = z.object({
	currentVersion: versionSchema,
	previousVersion: versionSchema.nullable(),
	documentTitle: z.string().min(1).max(200),
});

export const translationRequestSchema = z.object({
	text: z.string().min(1).max(10000),
	targetLanguage: z.string().min(2).max(50),
	sourceLanguage: z.string().optional(),
});

export const batchTranslationRequestSchema = z.object({
	documents: z.array(z.object({
		id: z.string(),
		text: z.string().min(1).max(10000),
	})).min(1).max(10),
	targetLanguage: z.string().min(2).max(50),
});

export const languageDetectionRequestSchema = z.object({
	text: z.string().min(1).max(5000),
});

export const suggestionRequestSchema = z.object({
	context: z.string().min(1).max(2000),
	documentTitle: z.string().optional(),
});

export const detectStruggleRequestSchema = z.object({
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

export const detectStruggleResponseSchema = z.object({
	struggleDetected: z.boolean(),
	confidence: z.number().min(0).max(1),
	concepts: z.array(detectedConceptSchema).max(3),
	recommendedAction: z.enum(['none', 'show_explanation', 'save_for_study_replay']),
});

export const studyExplanationRequestSchema = z.object({
	concept: z.string().min(1).max(120),
	difficulty: z.enum(['basic', 'intermediate', 'advanced']),
	documentContext: z.string().max(8000).default(''),
	teamDebate: z.array(z.string().max(500)).max(20).default([]),
	studentLevel: z.enum(['beginner', 'intermediate', 'advanced']),
});

export const studyExplanationResponseSchema = z.object({
	concept: z.string(),
	explanation: z.string(),
	simpleExample: z.string(),
	socraticQuestion: z.string(),
	commonMisconception: z.string(),
});

export const generateStudyReplayRequestSchema = z.object({
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

export const studyReplayResponseSchema = z.object({
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
