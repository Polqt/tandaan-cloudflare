import type { Context } from 'hono';

export type Bindings = {
	AI: Ai;
	API_SECRET: string;
	ALLOWED_ORIGIN?: string;
	CACHE?: KVNamespace;
};

export type AppContext = Context<{ Bindings: Bindings }>;

export type ChangeSummary = {
	addedBlocks: number;
	updatedBlocks: number;
	removedBlocks: number;
};

export type Difficulty = 'basic' | 'intermediate' | 'advanced';
export type RecommendedAction = 'none' | 'show_explanation' | 'save_for_study_replay';
export type StudentLevel = 'beginner' | 'intermediate' | 'advanced';

export type AiMessage = {
	role: 'system' | 'user';
	content: string;
};

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

export type ConceptDeepDiveDepth = 'standard' | 'advanced' | 'research';
export type MasteryLevel = 'foundational' | 'developing' | 'advanced';
export type StruggleSignal =
	| 'repeated_rewrite'
	| 'deleted_definition'
	| 'comment_question'
	| 'long_pause'
	| 'multi_contributor_edit'
	| 'large_revision';

export type ConceptDeepDiveRequest = {
	documentId: string;
	concept: string;
	subject?: string;
	assignmentTitle?: string;
	studentLevel: StudentLevel;
	depth: ConceptDeepDiveDepth;
	documentContext: string;
	replayContext: {
		versions: Array<{
			versionId: string;
			timestamp: string;
			content: string;
			aiNarrative?: string;
			summary?: ChangeSummary;
		}>;
		struggleSignals?: Array<{
			versionId: string;
			signal: StruggleSignal;
			evidence: string[];
		}>;
		teamDebate?: Array<{
			authorName?: string;
			text: string;
			timestamp?: string;
		}>;
	};
	options?: {
		includePracticeQuestions?: boolean;
		includeMisconceptions?: boolean;
		includeResearchDirections?: boolean;
		includeExternalSearchQueries?: boolean;
	};
};

export type ConceptDeepDiveResponse = {
	concept: string;
	subject?: string;
	masteryLevel: MasteryLevel;
	confidence: number;
	whyThisConceptMatters: string;
	whereItAppeared: Array<{
		versionId: string;
		reason: string;
		evidence: string[];
	}>;
	groundedExplanation: {
		shortExplanation: string;
		deeperExplanation: string;
		projectSpecificConnection: string;
		simpleExample: string;
	};
	misconceptionCheck: Array<{
		misconception: string;
		whyItIsWrong: string;
		howToFixThinking: string;
	}>;
	deepQuestions: Array<{
		question: string;
		whyThisQuestionMatters: string;
		expectedReasoningPath: string[];
	}>;
	practiceQuestions: Array<{
		difficulty: 'easy' | 'medium' | 'hard';
		question: string;
		answerGuide: string;
	}>;
	researchDirections: Array<{
		title: string;
		whyExploreThis: string;
		searchQuery: string;
	}>;
	nextStudyStep: string;
	tokensUsed?: number;
	processingTime: number;
	cached?: boolean;
};
