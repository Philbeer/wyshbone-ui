import fg from 'fast-glob';
import { readFile } from 'fs/promises';
import { createHash } from 'crypto';
import path from 'path';

const INCLUDE_PATTERNS = [
  'package.json',
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  '.replit',
  'replit.nix',
  'tsconfig*.json',
  'vite.config.*',
  'next.config.*',
  'astro.config.*',
  'webpack.config.*',
  'src/**',
  'server/**',
  'app/**',
  'api/**',
  'routes/**',
  'lib/**',
  'functions/**',
  'prisma/**',
  'db/**',
  'supabase/**',
  'scripts/**',
  'schema.*',
  'drizzle.config.*',
  'prisma/schema.prisma',
  'database.sql',
  'migrations/**',
  'README.md',
  'docs/**/*.md',
  'public/robots.txt',
];

const EXCLUDE_PATTERNS = [
  'node_modules/**',
  '.git/**',
  '.next/**',
  '.vercel/**',
  '.turbo/**',
  'dist/**',
  'build/**',
  'coverage/**',
  '.cache/**',
  'tmp/**',
  '.env*',
  '**/*.png',
  '**/*.jpg',
  '**/*.jpeg',
  '**/*.gif',
  '**/*.svg',
  '**/*.webp',
  '**/*.ico',
  '**/*.woff*',
  '**/*.ttf',
  '**/*.pdf',
  '**/*.mp4',
  '**/*.zip',
];

type FileInfo = {
  path: string;
  size: number;
  loc: number;
  hash: string;
} | {
  path: string;
  skipped: true;
  reason: string;
};

type SummaryData = {
  appName: string;
  generatedAt: string;
  totals: {
    files: number;
    sizeBytes: number;
    loc: number;
    todo: number;
    fixme: number;
  };
  quality: {
    clevernessIndex: number;
    hasTypes: boolean;
    hasDocs: boolean;
    hasApi: boolean;
    testsCount: number;
  };
  ui001_goalCaptureEnabled: boolean;
  files: FileInfo[];
};

let cachedSummary: SummaryData | null = null;
let cachedFileList: Set<string> | null = null;
let cacheTimestamp: number | null = null;
const CACHE_TTL_MS = 30000; // 30 seconds - prevents serving stale file lists

async function scanFiles(): Promise<FileInfo[]> {
  const files = await fg(INCLUDE_PATTERNS, {
    ignore: EXCLUDE_PATTERNS,
    dot: true,
    onlyFiles: true,
  });

  const fileInfos: FileInfo[] = [];

  for (const filePath of files) {
    try {
      const content = await readFile(filePath, 'utf-8');
      const size = Buffer.byteLength(content, 'utf-8');
      const loc = content.split('\n').length;
      const hash = createHash('sha256').update(content).digest('hex');

      fileInfos.push({
        path: filePath,
        size,
        loc,
        hash,
      });
    } catch (error) {
      fileInfos.push({
        path: filePath,
        skipped: true,
        reason: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  return fileInfos;
}

function calculateMetrics(files: FileInfo[]): {
  totalFiles: number;
  totalSizeBytes: number;
  totalLoc: number;
  totalTodo: number;
  totalFixme: number;
  hasTypes: boolean;
  hasDocs: boolean;
  hasApi: boolean;
  testsCount: number;
  clevernessIndex: number;
} {
  let totalFiles = 0;
  let totalSizeBytes = 0;
  let totalLoc = 0;
  let totalTodo = 0;
  let totalFixme = 0;
  let hasTypes = false;
  let hasDocs = false;
  let hasApi = false;
  let testsCount = 0;

  for (const file of files) {
    if ('skipped' in file) continue;

    totalFiles++;
    totalSizeBytes += file.size;
    totalLoc += file.loc;

    if (file.path.endsWith('.ts') || file.path.endsWith('.tsx')) {
      hasTypes = true;
    }

    if (file.path === 'README.md' || file.path.startsWith('docs/')) {
      hasDocs = true;
    }

    if (
      file.path.startsWith('api/') ||
      file.path.startsWith('server/') ||
      file.path.startsWith('routes/')
    ) {
      hasApi = true;
    }

    if (/\.test\.|__tests__/i.test(file.path)) {
      testsCount++;
    }
  }

  // Count TODO and FIXME across all non-skipped files
  for (const file of files) {
    if ('skipped' in file) continue;

    try {
      const content = require('fs').readFileSync(file.path, 'utf-8');
      const todoMatches = content.match(/TODO/gi) || [];
      const fixmeMatches = content.match(/FIXME/gi) || [];
      totalTodo += todoMatches.length;
      totalFixme += fixmeMatches.length;
    } catch {
      // Skip if can't read
    }
  }

  const clevernessIndex = Math.round(
    Math.log10(totalLoc + 10) * 10 +
    testsCount * 5 +
    (hasTypes ? 8 : 0) +
    (hasDocs ? 4 : 0) +
    (hasApi ? 6 : 0) -
    Math.min(totalTodo + totalFixme, 50)
  );

  return {
    totalFiles,
    totalSizeBytes,
    totalLoc,
    totalTodo,
    totalFixme,
    hasTypes,
    hasDocs,
    hasApi,
    testsCount,
    clevernessIndex,
  };
}

export async function getSummary(): Promise<SummaryData> {
  const now = Date.now();
  
  // Invalidate cache after TTL to pick up file changes
  if (cachedSummary && cacheTimestamp && (now - cacheTimestamp) < CACHE_TTL_MS) {
    return cachedSummary;
  }

  const files = await scanFiles();
  const metrics = calculateMetrics(files);

  const summary: SummaryData = {
    appName: 'Wyshbone Agent',
    generatedAt: new Date().toISOString(),
    totals: {
      files: metrics.totalFiles,
      sizeBytes: metrics.totalSizeBytes,
      loc: metrics.totalLoc,
      todo: metrics.totalTodo,
      fixme: metrics.totalFixme,
    },
    quality: {
      clevernessIndex: metrics.clevernessIndex,
      hasTypes: metrics.hasTypes,
      hasDocs: metrics.hasDocs,
      hasApi: metrics.hasApi,
      testsCount: metrics.testsCount,
    },
    ui001_goalCaptureEnabled: true,
    files,
  };

  cachedSummary = summary;
  cachedFileList = new Set(files.filter(f => !('skipped' in f)).map(f => f.path));
  cacheTimestamp = now;

  return summary;
}

export async function getFileContent(requestedPath: string): Promise<{ path: string; content: string }> {
  if (!cachedFileList) {
    await getSummary();
  }

  const normalizedPath = path.normalize(requestedPath).replace(/^(\.\.[\/\\])+/, '');

  if (!cachedFileList?.has(normalizedPath)) {
    throw new Error('File not in whitelist or does not exist');
  }

  try {
    const content = await readFile(normalizedPath, 'utf-8');
    return {
      path: normalizedPath,
      content,
    };
  } catch (error) {
    throw new Error(`Failed to read file: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export function clearCache(): void {
  cachedSummary = null;
  cachedFileList = null;
  cacheTimestamp = null;
}
