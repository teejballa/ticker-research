// src/app/api/analysis/[ticker]/route.ts
// POST /api/analysis/[ticker]
// Spawns the notebooklm_research.py Python script and streams SSE events to the browser.
// SSE events: { type: 'progress', message: string }
//             { type: 'result', data: AnalysisResult }
//             { type: 'error', message: string }

import { spawn } from 'child_process';
import { NextRequest } from 'next/server';

// 10-minute timeout for the Python script (Next.js route segment config)
export const maxDuration = 600;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ ticker: string }> }
) {
  await params; // consume params (ticker available if needed for logging)
  const { filePath } = await request.json() as { filePath: string };

  const stream = new ReadableStream({
    start(controller) {
      let closed = false;

      const encode = (data: string) =>
        new TextEncoder().encode(`data: ${data}\n\n`);

      const close = () => {
        if (!closed) {
          closed = true;
          try {
            controller.close();
          } catch {
            // Already closed
          }
        }
      };

      const enqueue = (data: string) => {
        if (!closed) {
          try {
            controller.enqueue(encode(data));
          } catch {
            // Controller closed
          }
        }
      };

      const proc = spawn('python3', ['scripts/notebooklm_research.py', filePath]);

      let buffer = '';

      proc.stdout.on('data', (chunk: Buffer) => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (line.startsWith('PROGRESS: ')) {
            const msg = line.slice('PROGRESS: '.length);
            enqueue(JSON.stringify({ type: 'progress', message: msg }));
          } else if (line.startsWith('RESULT: ')) {
            const json = line.slice('RESULT: '.length);
            try {
              const data = JSON.parse(json);
              enqueue(JSON.stringify({ type: 'result', data }));
            } catch {
              enqueue(JSON.stringify({ type: 'error', message: 'Failed to parse analysis result.' }));
            }
            proc.kill();
            close();
          } else if (line.startsWith('ERROR: ')) {
            const msg = line.slice('ERROR: '.length);
            enqueue(JSON.stringify({ type: 'error', message: msg }));
            proc.kill();
            close();
          }
        }
      });

      proc.stderr.on('data', (chunk: Buffer) => {
        // Log to server console only — not streamed to client
        console.error('[notebooklm_research.py stderr]', chunk.toString());
      });

      proc.on('close', (code) => {
        if (!closed) {
          if (code !== 0) {
            enqueue(JSON.stringify({ type: 'error', message: 'Analysis script exited unexpectedly.' }));
          }
          close();
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
