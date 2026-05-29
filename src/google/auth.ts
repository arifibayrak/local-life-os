import { OAuth2Client } from 'google-auth-library';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { config } from '../config.js';
import { vaultPaths } from '../vault/paths.js';

export const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar';
const TOKEN_FILE = join(vaultPaths.root, '.secrets', 'google.json');

interface StoredToken { refresh_token?: string; scope?: string; saved_at?: string }

export function googleConfigured(): boolean {
  return !!(config.google.clientId && config.google.clientSecret);
}

export function newOAuthClient(redirectUri?: string): OAuth2Client {
  if (!googleConfigured()) throw new Error('GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET not set in .env');
  return new OAuth2Client(config.google.clientId!, config.google.clientSecret!, redirectUri);
}

export function saveToken(t: StoredToken): void {
  mkdirSync(dirname(TOKEN_FILE), { recursive: true });
  writeFileSync(TOKEN_FILE, JSON.stringify({ ...t, saved_at: new Date().toISOString() }, null, 2));
}

export function loadToken(): StoredToken | null {
  if (!existsSync(TOKEN_FILE)) return null;
  try { return JSON.parse(readFileSync(TOKEN_FILE, 'utf8')) as StoredToken; } catch { return null; }
}

export function isConnected(): boolean {
  return googleConfigured() && !!loadToken()?.refresh_token;
}

/** Get a fresh access token from the stored refresh token. */
export async function getAccessToken(): Promise<string> {
  const stored = loadToken();
  if (!stored?.refresh_token) throw new Error('not connected — run `npm run auth:google`');
  const client = newOAuthClient();
  client.setCredentials({ refresh_token: stored.refresh_token });
  const { token } = await client.getAccessToken();
  if (!token) throw new Error('failed to refresh Google access token');
  return token;
}
