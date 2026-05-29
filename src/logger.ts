/** Minimal stdout logger. All logs stay local. */
function ts(): string {
  return new Date().toISOString();
}

export const log = {
  info: (msg: string, ...rest: unknown[]) => console.log(`[llos ${ts()}] ${msg}`, ...rest),
  warn: (msg: string, ...rest: unknown[]) => console.warn(`[llos ${ts()}] WARN ${msg}`, ...rest),
  error: (msg: string, ...rest: unknown[]) => console.error(`[llos ${ts()}] ERROR ${msg}`, ...rest),
};
