import { execFile } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { promisify } from 'node:util';
import { config } from '../config.js';
import { log } from '../logger.js';

const run = promisify(execFile);

export class TranscriptionUnavailable extends Error {}

/**
 * Transcribe an audio file locally with whisper.cpp. Requires WHISPER_BIN +
 * WHISPER_MODEL in .env. whisper.cpp wants 16kHz mono WAV; if `ffmpeg` is on
 * PATH we convert first, otherwise we pass the file through as-is.
 * Returns the transcribed text. Nothing leaves the machine.
 */
export async function transcribe(audioPath: string): Promise<string> {
  if (!config.whisper.bin || !config.whisper.model) {
    throw new TranscriptionUnavailable('voice disabled: set WHISPER_BIN and WHISPER_MODEL in .env');
  }

  let input = audioPath;
  const wav = `${audioPath}.16k.wav`;
  try {
    await run('ffmpeg', ['-y', '-i', audioPath, '-ar', '16000', '-ac', '1', wav]);
    input = wav;
  } catch {
    log.warn('ffmpeg not found or failed; passing audio to whisper as-is');
  }

  const outBase = `${audioPath}.out`;
  await run(config.whisper.bin, [
    '-m', config.whisper.model,
    '-f', input,
    '-l', config.whisper.language,
    '-otxt', '-of', outBase,
    '-np',
  ]);

  const txtFile = `${outBase}.txt`;
  if (!existsSync(txtFile)) throw new Error('whisper produced no transcript');
  const text = readFileSync(txtFile, 'utf8').trim();

  for (const f of [wav, txtFile]) if (existsSync(f)) rmSync(f);
  return text;
}
