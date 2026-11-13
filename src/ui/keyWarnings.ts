import type { HealthConfig } from './types';

/** Last-known status only; no live validation or secret values. */
export function keyWarnings(config: HealthConfig): string[] {
  const warnings: string[] = [];
  if (!config.youtubeApiKeyConfigured) warnings.push('YouTube API key is not configured; scans cannot run.');
  else if (config.apiHealth?.youtube?.state === 'invalid_key') warnings.push('Last YouTube request rejected the API key. Check the key in Render.');
  else if (config.apiHealth?.youtube?.state === 'quota_exceeded') warnings.push('Last YouTube request reached a quota or rate limit. Wait for the limit to reset.');
  if (!config.aiDraftsConfigured) warnings.push('OpenAI key is not configured; a clearly labeled automatic fallback may be available for specific niche questions.');
  else if (config.apiHealth?.openai?.state === 'invalid_key') warnings.push('Last OpenAI request rejected the key. Check the key in Render.');
  return warnings;
}
