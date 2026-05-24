export const MAX_CONTENT_LENGTH = 4000;
export const MAX_REPLAY_CONTEXT_LENGTH = 9000;
export const MAX_DEEP_DIVE_DOCUMENT_CONTEXT_LENGTH = 8000;
export const MAX_DEEP_DIVE_VERSION_CONTENT_LENGTH = 2000;
export const MAX_DEEP_DIVE_REPLAY_VERSIONS = 8;
export const CACHE_TTL_SECONDS = 60 * 60 * 24;
export const DEEP_DIVE_CACHE_TTL_SECONDS = {
	standard: 60 * 60 * 24,
	advanced: 60 * 60 * 12,
	research: 60 * 60 * 6,
} as const;
export const AI_MODEL = '@cf/meta/llama-3.1-8b-instruct' as keyof AiModels;
