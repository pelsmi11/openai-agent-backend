import { createSign } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { CONFIG } from '../../utils/constants/config.js';

// Client assertion (RS256 JWT) proving this backend is the registered ZITADEL API application,
// per the private_key_jwt auth method: https://oauth.net/private-key-jwt/
function buildClientAssertion(): string {
  const header = { alg: 'RS256', kid: CONFIG.ZITADEL_API_KEY_ID };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: CONFIG.ZITADEL_API_CLIENT_ID,
    sub: CONFIG.ZITADEL_API_CLIENT_ID,
    aud: CONFIG.ZITADEL_DOMAIN,
    iat: now,
    exp: now + 60,
  };
  const signingInput = `${Buffer.from(JSON.stringify(header)).toString('base64url')}.${Buffer.from(JSON.stringify(payload)).toString('base64url')}`;
  const signature = createSign('RSA-SHA256')
    .update(signingInput)
    .sign(CONFIG.ZITADEL_API_PRIVATE_KEY.replace(/\\n/g, '\n'));
  return `${signingInput}.${signature.toString('base64url')}`;
}

/**
 * Protects routes by validating the bearer token against ZITADEL's token introspection
 * endpoint (oauth/v2/introspect), authenticating as this backend's ZITADEL API application
 * via private_key_jwt (client_assertion signed with the app's private key).
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) {
    res.status(401).json({ error: 'Missing bearer token' });
    return;
  }

  try {
    const introspectRes = await fetch(`${CONFIG.ZITADEL_DOMAIN}/oauth/v2/introspect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        token,
        client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
        client_assertion: buildClientAssertion(),
      }),
    });

    const introspection = (await introspectRes.json()) as { active?: boolean };
    if (!introspectRes.ok || !introspection.active) {
      res.status(401).json({ error: 'Invalid or expired token' });
      return;
    }

    next();
  } catch {
    res.status(401).json({ error: 'Token validation failed' });
  }
}
