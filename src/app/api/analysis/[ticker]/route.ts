// src/app/api/analysis/[ticker]/route.ts
// POST /api/analysis/[ticker]
// In local mode: spawns the notebooklm_research.py Python script and streams SSE events to the browser.
// In cloud mode (DEPLOYMENT_MODE=cloud): proxies the request to DAYTONA_CONTAINER_URL and pipes its SSE stream back.
// SSE events: { type: 'progress', message: string }
//             { type: 'result', data: AnalysisResult }
//             { type: 'error', message: string }

import { spawn } from 'child_process';
import { NextRequest } from 'next/server';

// Force dynamic evaluation so Vercel reads DEPLOYMENT_MODE at request time, not build time.
export const dynamic = 'force-dynamic';

// 5-minute timeout for the Vercel function (proxy only — actual work happens in the Daytona container).
// The local path may take longer, but Vercel Hobby cap is 300 s.
export const maxDuration = 300;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const { ticker } = await params;
  const { filePath } = await request.json() as { filePath: string };

  // Cloud deployment branch: proxy to the Daytona container
  if (process.env.DEPLOYMENT_MODE === 'cloud') {
    const containerUrl = process.env.DAYTONA_CONTAINER_URL;
    if (!containerUrl) {
      return new Response(
        JSON.stringify({ type: 'error', message: 'DAYTONA_CONTAINER_URL is not configured.' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const upstream = await fetch(`${containerUrl}/api/analysis/${ticker}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filePath }),
    });

    return new Response(upstream.body, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  }

  // Local execution branch: spawn the Python script and stream its output as SSE
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
