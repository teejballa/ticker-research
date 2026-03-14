// src/app/api/setup/auth/route.ts
// POST /api/setup/auth — spawns `notebooklm login`, polls for storage_state.json.
import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { homedir } from 'os';
import path from 'path';
import { NextRequest } from 'next/server';

const POLL_INTERVAL_MS = 2000;       // check every 2 seconds
const WAITING_NOTIFY_INTERVAL_MS = 5000;  // notify user every 5 seconds
const TIMEOUT_MS = 10 * 60 * 1000;  // 10 minutes

function encodeSSE(data: object): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(data)}\n\n`);
}

function getAuthFilePath(): string {
  const notebooklmHome = process.env.NOTEBOOKLM_HOME ?? path.join(homedir(), '.notebooklm');
  return path.join(notebooklmHome, 'storage_state.json');
}

export async function POST(_request: NextRequest): Promise<Response> {
  const stream = new ReadableStream({
    start(controller) {
      const authFilePath = getAuthFilePath();

      // Spawn the notebooklm login process (opens browser on user's screen)
      const proc = spawn('notebooklm', ['login'], {
        detached: false,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      proc.stderr?.on('data', (chunk: Buffer) => {
        console.error('[notebooklm login stderr]', chunk.toString());
      });

      let closed = false;

      function closeStream() {
        if (closed) return;
        closed = true;
        try {
          proc.kill();
        } catch { /* ignore */ }
        try {
          controller.close();
        } catch { /* already closed */ }
      }

      const startTime = Date.now();
      let lastWaiting = Date.now();

      // Poll for the auth file
      const pollInterval = setInterval(() => {
        if (closed) {
          clearInterval(pollInterval);
          return;
        }

        // Check timeout
        if (Date.now() - startTime > TIMEOUT_MS) {
          clearInterval(pollInterval);
          controller.enqueue(encodeSSE({ type: 'error', message: 'Login timed out after 10 minutes' }));
          closeStream();
          return;
        }

        // Send waiting notification every 5 seconds
        if (Date.now() - lastWaiting >= WAITING_NOTIFY_INTERVAL_MS) {
          controller.enqueue(encodeSSE({ type: 'waiting' }));
          lastWaiting = Date.now();
        }

        // Check if auth file appeared
        if (existsSync(authFilePath)) {
          clearInterval(pollInterval);
          controller.enqueue(encodeSSE({ type: 'complete' }));
          closeStream();
        }
      }, POLL_INTERVAL_MS);

      // Handle process errors (e.g., notebooklm CLI not installed)
      proc.on('error', (err: Error) => {
        clearInterval(pollInterval);
        controller.enqueue(encodeSSE({ type: 'error', message: `Failed to start notebooklm login: ${err.message}` }));
        closeStream();
      });

      // If the process exits before the auth file appears (unexpected)
      proc.on('close', (code: number | null) => {
        if (closed) return;
        // Only treat as error if auth file still doesn't exist
        if (!existsSync(authFilePath)) {
          clearInterval(pollInterval);
          controller.enqueue(encodeSSE({ type: 'error', message: `notebooklm login exited unexpectedly (code ${code})` }));
          closeStream();
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
