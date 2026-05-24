import { Hono } from 'hono';
import { runAiText } from '../lib/ai';
import { parseBlockNoteToPlainText } from '../lib/blocknote';
import { errorResponse, log, parseJsonBody } from '../lib/http';
import { generateSummaryPrompt } from '../lib/prompts';
import { versionSummaryRequestSchema } from '../schemas';
import type { Bindings, ChangeSummary } from '../types';

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

export const summaryRoute = new Hono<{ Bindings: Bindings }>();

summaryRoute.post('/generate-summary', async (c) => {
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

		log('Summary generated successfully', {
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
		log('AI generation failed', { error: String(error) });
		return errorResponse(c, 'AI generation failed', 500, String(error));
	}
});
