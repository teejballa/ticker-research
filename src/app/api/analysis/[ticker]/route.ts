// src/app/api/analysis/[ticker]/route.ts
// POST /api/analysis/[ticker]
// In local mode: spawns the notebooklm_research.py Python script and streams SSE events to the browser.
// In web mode (DEPLOYMENT_MODE=web): proxies the request to CONTAINER_URL and pipes its SSE stream back.
// SSE events: { type: 'progress', message: string }
//             { type: 'result', data: AnalysisResult }
//             { type: 'error', message: string }

import { spawn } from 'child_process';
import { NextRequest } from 'next/server';
import { writeReport } from '@/lib/reports';
import type { AnalysisResult } from '@/lib/types';

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

  // Web deployment branch: authenticate user, retrieve per-user NbLM credentials from Neon,
  // decrypt them, and forward source package content + decrypted storage state to Daytona container.
  // Supersedes the old DEPLOYMENT_MODE=cloud branch (which incorrectly forwarded a filePath
  // that is only accessible on Vercel's ephemeral filesystem, not cross-network).
  if (process.env.DEPLOYMENT_MODE === 'web') {
    // All imports are dynamic — prevents Prisma/NextAuth from loading in local mode
    const { getServerSession } = await import('next-auth/next');
    const { authOptions } = await import('@/lib/auth');
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return new Response(
        JSON.stringify({ type: 'error', message: 'Not authenticated' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const containerUrl = process.env.CONTAINER_URL;
    if (!containerUrl) {
      return new Response(
        JSON.stringify({ type: 'error', message: 'CONTAINER_URL is not configured.' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Read source package content from Vercel's ephemeral filesystem
    const { readFile } = await import('fs/promises');
    const sourcePackage = JSON.parse(await readFile(filePath, 'utf-8'));

    // Load and decrypt per-user NbLM credentials from Neon
    const { getCredential } = await import('@/lib/user-credential-db');
    const cred = await getCredential(session.user.email);
    if (!cred) {
      return new Response(
        JSON.stringify({ type: 'error', message: 'NotebookLM account not connected.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }
    const { decrypt } = await import('@/lib/credentials');
    const storageState = JSON.parse(decrypt(cred.encrypted_state));

    // Wrap in a ReadableStream so we can emit a cold-start message before the container responds.
    // With min-instances=0, Cloud Run takes ~20-40s to start from zero — without this the
    // frontend would hang silently with no SSE events during that window.
    const enc = (data: string) => new TextEncoder().encode(`data: ${data}\n\n`);
    const coldStartStream = new ReadableStream({
      async start(controller) {
        // Quick health ping — fails fast when container is cold.
        // Wrapped in try/catch because AbortSignal.timeout may not exist in all environments.
        const isCold = await (async () => {
          try {
            await fetch(`${containerUrl}/health`, {
              signal: AbortSignal.timeout(3000),
            });
            return false;
          } catch {
            return true;
          }
        })();

        if (isCold) {
          controller.enqueue(enc(JSON.stringify({
            type: 'progress',
            message: 'Waking up research environment (cold start ~30s)...',
          })));
        }

        // Forward to container — Cloud Run queues the request until the instance is ready
        const upstream = await fetch(`${containerUrl}/analyze/${ticker}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-container-secret': process.env.CONTAINER_SECRET!,
          },
          body: JSON.stringify({ sourcePackage, storageState }),
        });

        if (!upstream.ok || !upstream.body) {
          controller.enqueue(enc(JSON.stringify({ type: 'error', message: 'Container request failed.' })));
          controller.close();
          return;
        }

        const reader = upstream.body.getReader();
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            controller.enqueue(value);
          }
        } finally {
          controller.close();
        }
      },
    });

    return new Response(coldStartStream, {
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
            // Async persist + stream using IIFE to keep non-async context working
            (async () => {
              try {
                const data = JSON.parse(json) as AnalysisResult;
                // Persist report BEFORE streaming result — non-fatal if it fails
                if (process.env.DEPLOYMENT_MODE === 'web') {
                  // Web mode: persist to Neon for the authenticated user
                  try {
                    const { writeReportToDb } = await import('@/lib/reports-db');
                    const session = await import('next-auth/next').then(m => m.getServerSession);
                    const { authOptions } = await import('@/lib/auth');
                    const sess = await session(authOptions);
                    if (sess?.user?.email) {
                      await writeReportToDb(data, sess.user.email);
                    }
                  } catch (writeErr) {
                    console.error('[history] Web mode: Failed to write report to DB:', writeErr);
                    // Non-fatal — continue streaming result
                  }
                } else {
                  // Local mode: persist to filesystem (existing behavior, unchanged)
                  try {
                    await writeReport(data);
                  } catch (writeErr) {
                    console.error('[history] Failed to write report:', writeErr);
                  }
                }
                enqueue(JSON.stringify({ type: 'result', data }));
              } catch {
                enqueue(JSON.stringify({ type: 'error', message: 'Failed to parse analysis result.' }));
              }
              proc.kill();
              close();
            })();
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
