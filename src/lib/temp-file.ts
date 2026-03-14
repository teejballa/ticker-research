// src/lib/temp-file.ts
// Temp file lifecycle for source packages.
// Files are written to os.tmpdir() — NEVER to the project directory.
// NEVER commit source package JSON files to the repository.

import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import type { SourcePackage } from '@/lib/types';

export async function writeSourcePackage(pkg: SourcePackage): Promise<string> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ticker-research-'));
  const filePath = path.join(tmpDir, `${pkg.ticker}-${Date.now()}.json`);
  await fs.writeFile(filePath, JSON.stringify(pkg, null, 2), 'utf8');
  return filePath;
}

export async function readSourcePackage(filePath: string): Promise<SourcePackage> {
  const contents = await fs.readFile(filePath, 'utf8');
  return JSON.parse(contents) as SourcePackage;
}

export async function cleanupSourcePackage(filePath: string): Promise<void> {
  try {
    await fs.unlink(filePath);
    await fs.rmdir(path.dirname(filePath));
  } catch {
    // Best-effort cleanup — OS temp directory will be cleared eventually
  }
}
