/**
 * One-time Google Calendar authorization (loopback flow for a Desktop OAuth client).
 * Run: npm run auth:google
 * Opens your browser, you consent once, and the refresh token is saved to the
 * vault at .secrets/google.json. Re-runnable.
 */
import { createServer } from 'node:http';
import { exec } from 'node:child_process';
import { newOAuthClient, saveToken, CALENDAR_SCOPE, googleConfigured } from '../src/google/auth.js';

const PORT = 53682;
const redirect = `http://127.0.0.1:${PORT}`;

if (!googleConfigured()) {
  console.error('Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env first.');
  process.exit(1);
}

const client = newOAuthClient(redirect);
const authUrl = client.generateAuthUrl({ access_type: 'offline', prompt: 'consent', scope: [CALENDAR_SCOPE] });

const server = createServer(async (req, res) => {
  const code = new URL(req.url ?? '/', redirect).searchParams.get('code');
  if (!code) { res.writeHead(400); res.end('Waiting for Google redirect…'); return; }
  try {
    const { tokens } = await client.getToken(code);
    if (tokens.refresh_token) {
      saveToken({ refresh_token: tokens.refresh_token, scope: tokens.scope ?? CALENDAR_SCOPE });
      console.log('\n✓ Connected — refresh token saved. You can use the Calendar page now.');
    } else {
      console.log('\n! No refresh_token returned. Revoke prior access at myaccount.google.com/permissions and re-run.');
    }
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end('<h2>Connected to local-life-os ✓</h2><p>Refresh token saved. Close this tab.</p>');
  } catch (e) {
    res.writeHead(500); res.end('Error: ' + String(e)); console.error(e);
  } finally {
    setTimeout(() => { server.close(); process.exit(0); }, 600);
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('\nAuthorize Google Calendar access — opening your browser. If it does not open, visit:\n\n  ' + authUrl + '\n');
  exec(`open "${authUrl}"`);
});
