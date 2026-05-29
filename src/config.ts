import { homedir } from 'node:os';
import { join } from 'node:path';
import 'dotenv/config';

function num(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function str(name: string, fallback: string): string {
  const raw = process.env[name];
  return raw === undefined || raw === '' ? fallback : raw;
}

function optional(name: string): string | null {
  const raw = process.env[name];
  return raw === undefined || raw === '' ? null : raw;
}

export const config = {
  vaultPath: process.env['VAULT_PATH'] ?? join(homedir(), 'local-life-os-vault'),

  host: str('HOST', '127.0.0.1'),
  port: num('PORT', 3003),

  llm: {
    baseUrl: str('LLM_BASE_URL', 'http://127.0.0.1:8088/v1'),
    model: str('LLM_MODEL', 'mlx-community/Qwen3.5-9B-MLX-4bit'),
    maxTokens: num('LLM_MAX_TOKENS', 1024),
    temperature: num('LLM_TEMPERATURE', 0),
  },

  whisper: {
    bin: optional('WHISPER_BIN'),
    model: optional('WHISPER_MODEL'),
    language: str('WHISPER_LANGUAGE', 'en'),
  },

  sessionIdleMinutes: num('SESSION_IDLE_MINUTES', 15),

  google: {
    clientId: optional('GOOGLE_CLIENT_ID'),
    clientSecret: optional('GOOGLE_CLIENT_SECRET'),
  },
} as const;

export type Config = typeof config;
