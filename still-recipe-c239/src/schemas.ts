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

export const conceptDeepDiveDepthSchema = z.enum(['standard', 'advanced', 'research']);
export const masteryLevelSchema = z.enum(['foundational', 'developing', 'advanced']);
export const struggleSignalSchema = z.enum([
	'repeated_rewrite',
	'deleted_definition',
	'comment_question',
	'long_pause',
	'multi_contributor_edit',
	'large_revision',
]);

export const conceptDeepDiveRequestSchema = z.object({
	documentId: z.string().min(1).max(200),
	concept: z.string().min(1).max(120),
	subject: z.string().max(120).optional(),
	assignmentTitle: z.string().max(200).optional(),
	studentLevel: z.enum(['beginner', 'intermediate', 'advanced']),
	depth: conceptDeepDiveDepthSchema,
	documentContext: z.string().min(1),
	replayContext: z.object({
		versions: z.array(z.object({
			versionId: z.string().min(1).max(200),
			timestamp: z.string().datetime(),
			content: z.string().min(1),
			aiNarrative: z.string().max(1000).optional(),
			summary: changeSummarySchema.optional(),
		})).min(1).max(100),
		struggleSignals: z.array(z.object({
			versionId: z.string().min(1).max(200),
			signal: struggleSignalSchema,
			evidence: z.array(z.string().max(500)).max(10),
		})).max(100).optional(),
		teamDebate: z.array(z.object({
			authorName: z.string().max(120).optional(),
			text: z.string().min(1).max(1000),
			timestamp: z.string().datetime().optional(),
		})).max(50).optional(),
	}),
	options: z.object({
		includePracticeQuestions: z.boolean().optional(),
		includeMisconceptions: z.boolean().optional(),
		includeResearchDirections: z.boolean().optional(),
		includeExternalSearchQueries: z.boolean().optional(),
	}).optional(),
});

export const conceptDeepDiveAiResponseSchema = z.object({
	concept: z.string(),
	subject: z.string().optional(),
	masteryLevel: masteryLevelSchema,
	confidence: z.number().min(0).max(1),
	whyThisConceptMatters: z.string(),
	whereItAppeared: z.array(z.object({
		versionId: z.string(),
		reason: z.string(),
		evidence: z.array(z.string()).max(5),
	})).max(8),
	groundedExplanation: z.object({
		shortExplanation: z.string(),
		deeperExplanation: z.string(),
		projectSpecificConnection: z.string(),
		simpleExample: z.string(),
	}),
	misconceptionCheck: z.array(z.object({
		misconception: z.string(),
		whyItIsWrong: z.string(),
		howToFixThinking: z.string(),
	})).max(3),
	deepQuestions: z.array(z.object({
		question: z.string(),
		whyThisQuestionMatters: z.string(),
		expectedReasoningPath: z.array(z.string()).min(1).max(5),
	})).min(1).max(3),
	practiceQuestions: z.array(z.object({
		difficulty: z.enum(['easy', 'medium', 'hard']),
		question: z.string(),
		answerGuide: z.string(),
	})).max(5),
	researchDirections: z.array(z.object({
		title: z.string(),
		whyExploreThis: z.string(),
		searchQuery: z.string(),
	})).max(5),
	nextStudyStep: z.string(),
	tokensUsed: z.number().int().min(0).optional(),
});

export const conceptDeepDiveResponseSchema = conceptDeepDiveAiResponseSchema.extend({
	processingTime: z.number().int().min(0),
	cached: z.boolean().optional(),
});
