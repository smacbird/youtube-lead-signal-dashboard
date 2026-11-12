// Same-origin JSON helper. Sends the per-session CSRF token on every non-GET request.
let csrfToken = '';

export function setCsrfToken(token: string) {
  csrfToken = token;
}

function apiErrorMessage(body: any, status: number) {
  const searchMessage = body?.searchErrors?.find((error: any) => error?.message)?.message;
  const directMessage = body?.error?.message || body?.message;
  const runMessage = body?.run?.errors?.find((error: any) => error?.message)?.message;
  const message = searchMessage || directMessage || runMessage || `Request failed: ${status}`;
  if (/api key not valid/i.test(message)) return 'YouTube API key is not valid. Update YOUTUBE_API_KEY in Render with a valid YouTube Data API v3 key.';
  if (/quota/i.test(message)) return `YouTube's daily limit was reached: ${message}`;
  return message;
}

export async function apiJson(path: string, options?: RequestInit) {
  const response = await fetch(path, {
    ...options,
    headers: { 'content-type': 'application/json', ...(options?.method && options.method !== 'GET' ? { 'x-csrf-token': csrfToken } : {}), ...(options?.headers || {}) },
  });
  if (response.status === 401) {
    window.location.assign('/login');
    throw new Error('Session expired. Sign in again.');
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(apiErrorMessage(body, response.status));
  return body;
}
