import { MAX_CONTENT_LENGTH, MAX_REPLAY_CONTEXT_LENGTH } from '../config';
import { parseBlockNoteToPlainText } from './blocknote';
import type {
	AiMessage,
	ChangeSummary,
	ConceptDeepDiveRequest,
	DetectStruggleRequest,
	GenerateStudyReplayRequest,
	StudyExplanationRequest,
} from '../types';

export function generateSummaryPrompt(
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

export function buildDetectStrugglePrompt(
	input: DetectStruggleRequest,
	currentText: string,
	previousText: string | null,
	evidence: string[],
): AiMessage[] {
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

export function buildStudyExplanationPrompt(input: StudyExplanationRequest): AiMessage[] {
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

export function buildStudyReplayPrompt(input: GenerateStudyReplayRequest, replayContext: string): AiMessage[] {
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

export function buildReplayContext(input: GenerateStudyReplayRequest): string {
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

export function buildConceptDeepDivePrompt(
	input: ConceptDeepDiveRequest,
	documentContext: string,
	replayDigest: string,
): AiMessage[] {
	const advancedInstruction = input.depth === 'advanced' || input.depth === 'research'
		? 'Generate advanced follow-up questions that require reasoning, not recall.'
		: 'Generate practical follow-up questions that build understanding.';
	const researchInstruction = input.depth === 'research'
		? 'Include research-style directions as search queries only. Do not invent papers, URLs, videos, or citations.'
		: 'If research directions are requested, return search queries only. Do not invent papers, URLs, videos, or citations.';

	return [
		{
			role: 'system',
			content: `You generate Tandaan Concept Deep Dive reports from project history.
This is not a chatbot. It is a structured deep-learning report from document history, replay checkpoints, team debate, and edit friction signals.
Ground every claim only in the provided document, replay digest, and team debate.
Do not invent papers, URLs, videos, citations, private facts, or unstated events.
Do not use medical, psychological, diagnostic, or personal judgment language.
Use neutral wording such as "This section may show uncertainty around", "The replay suggests this concept needed more attention", or "The document history shows repeated revision around".
Frame the value as: "Your project history becomes your mastery path."
Prefer concise but useful explanations.
${advancedInstruction}
${researchInstruction}
Produce valid JSON only with this exact shape:
{"concept":"string","subject":"string optional","masteryLevel":"foundational|developing|advanced","confidence":number,"whyThisConceptMatters":"string","whereItAppeared":[{"versionId":"string","reason":"string","evidence":["string"]}],"groundedExplanation":{"shortExplanation":"string","deeperExplanation":"string","projectSpecificConnection":"string","simpleExample":"string"},"misconceptionCheck":[{"misconception":"string","whyItIsWrong":"string","howToFixThinking":"string"}],"deepQuestions":[{"question":"string","whyThisQuestionMatters":"string","expectedReasoningPath":["string"]}],"practiceQuestions":[{"difficulty":"easy|medium|hard","question":"string","answerGuide":"string"}],"researchDirections":[{"title":"string","whyExploreThis":"string","searchQuery":"string"}],"nextStudyStep":"string","tokensUsed":number optional}`,
		},
		{
			role: 'user',
			content: `Feature: Concept Deep Dive
Document: ${input.documentId}
Concept: ${input.concept}
Subject: ${input.subject ?? 'unknown'}
Assignment: ${input.assignmentTitle ?? 'unknown'}
Student level: ${input.studentLevel}
Depth: ${input.depth}
Options: ${JSON.stringify(input.options ?? {})}

Document context:
${documentContext}

Compact replay digest:
${replayDigest}

Generate a personalized deep-learning report for this concept. If the evidence is thin, lower confidence and say what the next study step should verify.`,
		},
	];
}
