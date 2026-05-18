/**
 * TikTok OAuth 2.0 — gestion des tokens par niche.
 *
 * Flow:
 *   1. getAuthorizationUrl(niche) → URL à ouvrir dans le navigateur
 *   2. l'utilisateur autorise → TikTok redirige vers le callback avec un `code`
 *   3. exchangeCodeForToken(niche, code) → access_token + refresh_token
 *   4. getValidAccessToken(niche) → token valide (refresh auto si expiré)
 *
 * Les tokens sont stockés dans niches/<niche>/state/tiktok-tokens.json.
 */
import fs from 'node:fs';
import path from 'node:path';
import { NICHES_DIR, requireTikTokEnv } from './config.js';

const AUTH_BASE = 'https://www.tiktok.com/v2/auth/authorize/';
const TOKEN_URL = 'https://open.tiktokapis.com/v2/oauth/token/';
const SCOPES = ['user.info.basic', 'user.info.stats', 'video.publish', 'video.list'];

export interface TikTokTokens {
  access_token: string;
  refresh_token: string;
  open_id: string;
  scope: string;
  /** Unix ms — moment où l'access_token expire. */
  expires_at: number;
  /** Unix ms — moment où le refresh_token expire (≈ 365 jours). */
  refresh_expires_at: number;
}

function tokensFile(nicheId: string): string {
  return path.join(NICHES_DIR, nicheId, 'state', 'tiktok-tokens.json');
}

export function loadTokens(nicheId: string): TikTokTokens | null {
  const file = tokensFile(nicheId);
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8')) as TikTokTokens;
  } catch {
    return null;
  }
}

export function saveTokens(nicheId: string, tokens: TikTokTokens): void {
  const file = tokensFile(nicheId);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(tokens, null, 2));
}

export function isConnected(nicheId: string): boolean {
  return loadTokens(nicheId) !== null;
}

/**
 * Build the TikTok authorization URL. `state` encodes the niche so the callback
 * can identify which account is being connected.
 */
export function getAuthorizationUrl(nicheId: string): string {
  const { clientKey, redirectUri } = requireTikTokEnv();
  const params = new URLSearchParams({
    client_key: clientKey,
    scope: SCOPES.join(','),
    response_type: 'code',
    redirect_uri: redirectUri,
    state: `niche:${nicheId}`,
  });
  return `${AUTH_BASE}?${params.toString()}`;
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  open_id: string;
  scope: string;
  expires_in: number;
  refresh_expires_in: number;
  error?: string;
  error_description?: string;
}

async function postToken(body: Record<string, string>): Promise<TokenResponse> {
  const resp = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body).toString(),
  });
  const data = (await resp.json()) as TokenResponse;
  if (!resp.ok || data.error) {
    throw new Error(`TikTok token error: ${data.error ?? resp.status} — ${data.error_description ?? ''}`);
  }
  return data;
}

function toTokens(data: TokenResponse): TikTokTokens {
  const now = Date.now();
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    open_id: data.open_id,
    scope: data.scope,
    expires_at: now + data.expires_in * 1000,
    refresh_expires_at: now + data.refresh_expires_in * 1000,
  };
}

/** Exchange the OAuth `code` (from the callback page) for tokens. */
export async function exchangeCodeForToken(nicheId: string, code: string): Promise<TikTokTokens> {
  const { clientKey, clientSecret, redirectUri } = requireTikTokEnv();
  const data = await postToken({
    client_key: clientKey,
    client_secret: clientSecret,
    code: code.trim(),
    grant_type: 'authorization_code',
    redirect_uri: redirectUri,
  });
  const tokens = toTokens(data);
  saveTokens(nicheId, tokens);
  return tokens;
}

/** Refresh an expired access_token using the stored refresh_token. */
export async function refreshAccessToken(nicheId: string): Promise<TikTokTokens> {
  const { clientKey, clientSecret } = requireTikTokEnv();
  const current = loadTokens(nicheId);
  if (!current) throw new Error(`Niche ${nicheId} non connectée à TikTok`);
  if (Date.now() >= current.refresh_expires_at) {
    throw new Error(`Refresh token expiré pour ${nicheId} — relancer l'autorisation OAuth`);
  }
  const data = await postToken({
    client_key: clientKey,
    client_secret: clientSecret,
    grant_type: 'refresh_token',
    refresh_token: current.refresh_token,
  });
  const tokens = toTokens(data);
  saveTokens(nicheId, tokens);
  return tokens;
}

/** Return a valid access token, refreshing automatically if expired (60s margin). */
export async function getValidAccessToken(nicheId: string): Promise<string> {
  const current = loadTokens(nicheId);
  if (!current) throw new Error(`Niche ${nicheId} non connectée à TikTok — lancer "tt tiktok-auth ${nicheId}"`);
  if (Date.now() >= current.expires_at - 60_000) {
    const refreshed = await refreshAccessToken(nicheId);
    return refreshed.access_token;
  }
  return current.access_token;
}
