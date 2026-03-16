// src/app/api/setup/auth/route.ts
// POST /api/setup/auth — spawns notebooklm_auth.py, which opens a browser for
// Google login, detects completion automatically, saves storage_state.json,
// and closes the browser. No terminal interaction required.
import { spawn } from 'child_process';
import path from 'path';
import { NextRequest } from 'next/server';

function encodeSSE(data: object): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(data)}\n\n`);
}

export async function POST(_request: NextRequest): Promise<Response> {
  const stream = new ReadableStream({
    start(controller) {
      const scriptPath = path.join(process.cwd(), 'scripts', 'notebooklm_auth.py');

      const proc = spawn('python3', [scriptPath], {
        detached: false,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let closed = false;
      let completed = false;

      function closeStream() {
        if (closed) return;
        closed = true;
        try { proc.kill(); } catch { /* ignore */ }
        try { controller.close(); } catch { /* already closed */ }
      }

      // Read PROGRESS / COMPLETE / ERROR signals from stdout
      let buf = '';
      proc.stdout?.on('data', (chunk: Buffer) => {
        buf += chunk.toString();
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          if (trimmed.startsWith('PROGRESS: ')) {
            controller.enqueue(encodeSSE({ type: 'waiting', message: trimmed.slice('PROGRESS: '.length) }));
          } else if (trimmed === 'COMPLETE') {
            completed = true;
            controller.enqueue(encodeSSE({ type: 'complete' }));
            // Don't kill — let the script show the success screen and close naturally.
            // The stream closes; the process finishes on its own in ~2 seconds.
            closed = true;
            try { controller.close(); } catch { /* already closed */ }
          } else if (trimmed.startsWith('ERROR: ')) {
            controller.enqueue(encodeSSE({ type: 'error', message: trimmed.slice('ERROR: '.length) }));
            closeStream();
          }
        }
      });

      proc.stderr?.on('data', (chunk: Buffer) => {
        console.error('[notebooklm_auth.py stderr]', chunk.toString());
      });

      proc.on('error', (err: Error) => {
        if (closed) return;
        controller.enqueue(encodeSSE({ type: 'error', message: `Failed to start auth script: ${err.message}` }));
        closeStream();
      });

      proc.on('close', (code: number | null) => {
        if (closed) return;
        // Only show error if we never received COMPLETE
        if (!completed) {
          controller.enqueue(encodeSSE({ type: 'error', message: `Auth process exited unexpectedly (code ${code})` }));
        }
        closeStream();
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
