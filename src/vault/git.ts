import { simpleGit, type SimpleGit } from 'simple-git';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { vaultPaths } from './paths.js';
import { log } from '../logger.js';

let git: SimpleGit | null = null;

/** Initialise the Vault as a local git repo (no remote — nothing is pushed anywhere). */
export async function initVaultGit(): Promise<void> {
  git = simpleGit(vaultPaths.root);
  if (!existsSync(join(vaultPaths.root, '.git'))) {
    await git.init();
    await git.addConfig('user.name', 'local-life-os', false, 'local');
    await git.addConfig('user.email', 'llos@localhost', false, 'local');
    log.info(`vault git initialised @ ${vaultPaths.root}`);
  }
}

/** Stage everything and commit. Local-only; there is intentionally no push. */
export async function commitVault(message: string): Promise<void> {
  if (!git) git = simpleGit(vaultPaths.root);
  await git.add('.');
  const status = await git.status();
  if (status.files.length === 0) return;
  await git.commit(message);
  log.info(`vault commit: ${message}`);
}
