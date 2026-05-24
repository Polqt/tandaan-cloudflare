import { MAX_CONTENT_LENGTH } from '../config';

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

// Parse BlockNote JSON into plain text. Invalid JSON is treated as plain text.
export function parseBlockNoteToPlainText(blockNoteJson: string, maxLength = MAX_CONTENT_LENGTH): string {
	try {
		const parsed = JSON.parse(blockNoteJson);
		const text = extractTextFromContent(parsed).replace(/\s+/g, ' ').trim();
		return (text || blockNoteJson).slice(0, maxLength);
	} catch {
		return blockNoteJson.replace(/\s+/g, ' ').trim().slice(0, maxLength);
	}
}
