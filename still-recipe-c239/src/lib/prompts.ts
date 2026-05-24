import { MAX_CONTENT_LENGTH, MAX_REPLAY_CONTEXT_LENGTH } from '../config';
import { parseBlockNoteToPlainText } from './blocknote';
import type {
	AiMessage,
	ChangeSummary,
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
