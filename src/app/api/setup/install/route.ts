// src/app/api/setup/install/route.ts
// POST /api/setup/install — SSE: pip install -r scripts/requirements.txt then playwright install chromium.
import { spawn } from 'child_process';
import { NextRequest } from 'next/server';

function encodeSSE(data: object): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(data)}\n\n`);
}

export async function POST(_request: NextRequest): Promise<Response> {
  const stream = new ReadableStream({
    start(controller) {
      // Step 1: pip install -r scripts/requirements.txt
      const pip = spawn('pip3', ['install', '-r', 'scripts/requirements.txt'], {
        cwd: process.cwd(),
      });

      let pipFailed = false;
      let pipStderr = '';

      pip.stdout.on('data', (chunk: Buffer) => {
        const lines = chunk.toString().split('\n');
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed) {
            controller.enqueue(encodeSSE({ type: 'progress', message: trimmed }));
          }
        }
      });

      pip.stderr.on('data', (chunk: Buffer) => {
        // pip writes normal output to stderr too
        const lines = chunk.toString().split('\n');
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed) {
            controller.enqueue(encodeSSE({ type: 'progress', message: trimmed }));
          }
        }
        pipStderr += chunk.toString();
      });

      pip.on('close', (code: number | null) => {
        if (code !== 0) {
          pipFailed = true;
          controller.enqueue(encodeSSE({ type: 'error', message: `pip install failed: ${pipStderr.slice(-500)}` }));
          try { controller.close(); } catch { /* already closed */ }
          return;
        }

        if (pipFailed) return;

        // Step 2: playwright install chromium
        const playwright = spawn('playwright', ['install', 'chromium'], {
          cwd: process.cwd(),
        });

        let playwrightStderr = '';

        playwright.stdout.on('data', (chunk: Buffer) => {
          const lines = chunk.toString().split('\n');
          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed) {
              controller.enqueue(encodeSSE({ type: 'progress', message: trimmed }));
            }
          }
        });

        playwright.stderr.on('data', (chunk: Buffer) => {
          const lines = chunk.toString().split('\n');
          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed) {
              controller.enqueue(encodeSSE({ type: 'progress', message: trimmed }));
            }
          }
          playwrightStderr += chunk.toString();
        });

        playwright.on('close', (pwCode: number | null) => {
          if (pwCode !== 0) {
            controller.enqueue(encodeSSE({ type: 'error', message: `playwright install failed: ${playwrightStderr.slice(-500)}` }));
          } else {
            controller.enqueue(encodeSSE({ type: 'complete' }));
          }
          try { controller.close(); } catch { /* already closed */ }
        });
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
