import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const SESSION_AGE_MS = 8 * 60 * 60 * 1000;
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 8;

export function createAuth(env = process.env) {
  let origin;
  try {
    origin = new URL(env.AUTH_ORIGIN);
  } catch {
    origin = null;
  }
  const local = origin?.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname);
  const configured = Boolean(
    env.OWNER_PASSWORD?.length >= 16 && env.SESSION_SECRET?.length >= 32 && origin &&
    (origin.protocol === 'https:' || local) && origin.origin === env.AUTH_ORIGIN &&
    origin.pathname === '/' && !origin.username && !origin.password && !origin.search && !origin.hash
  );
  const cookieName = local ? 'bls_session' : '__Host-bls_session';
  const sessions = new Map();
  // One global bounded counter prevents proxy address spoofing from bypassing throttling.
  const attempts = [];
  const expectedPassword = configured ? scryptSync(env.OWNER_PASSWORD, env.SESSION_SECRET, 64) : null;
  const sign = (id) => createHmac('sha256', env.SESSION_SECRET).update(id).digest('hex');
  const cookie = (value, maxAge) => `${cookieName}=${value}; Path=/; HttpOnly; SameSite=Strict${local ? '' : '; Secure'}; Max-Age=${maxAge}`;
  const sameHost = (request) => configured && request.headers.host === origin.host;
  const sameOrigin = (request) => request.headers.origin === origin.origin && sameHost(request);

  function currentSession(request) {
    if (!configured || !sameHost(request)) return null;
    const value = (request.headers.cookie || '').split(';').map((part) => part.trim()).find((part) => part.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
    const match = /^([a-f0-9]{64})\.([a-f0-9]{64})$/.exec(value || '');
    if (!match || !timingSafeEqual(Buffer.from(match[2]), Buffer.from(sign(match[1])))) return null;
    const session = sessions.get(match[1]);
    if (!session) return null;
    if (session.expiresAt <= Date.now()) {
      sessions.delete(match[1]);
      return null;
    }
    return { id: match[1], ...session };
  }

  function login(request, password) {
    if (!sameOrigin(request)) return { status: 403 };
    const now = Date.now();
    while (attempts.length && attempts[0] <= now - WINDOW_MS) attempts.shift();
    if (attempts.length >= MAX_ATTEMPTS) return { status: 429 };
    attempts.push(now);
    const candidate = scryptSync(password, env.SESSION_SECRET, 64);
    if (!timingSafeEqual(candidate, expectedPassword)) return { status: 401 };
    attempts.length = 0;
    for (const [id, session] of sessions) if (session.expiresAt <= now) sessions.delete(id);
    if (sessions.size >= 32) sessions.delete(sessions.keys().next().value);
    const id = randomBytes(32).toString('hex');
    const csrf = randomBytes(32).toString('hex');
    sessions.set(id, { csrf, expiresAt: now + SESSION_AGE_MS });
    return { status: 303, cookie: cookie(`${id}.${sign(id)}`, SESSION_AGE_MS / 1000) };
  }

  function logout(response, session) {
    sessions.delete(session.id);
    response.setHeader('set-cookie', cookie('', 0));
  }

  return { configured, sameHost, sameOrigin, currentSession, login, logout };
}
