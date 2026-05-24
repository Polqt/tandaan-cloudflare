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
