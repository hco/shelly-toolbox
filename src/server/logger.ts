import { createWriteStream, existsSync, mkdirSync, type WriteStream } from 'fs';
import { dirname, isAbsolute, join } from 'path';
import { format } from 'util';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '../..');
const DEFAULT_LOG_PATH = 'logs/server.log';

type ConsoleMethod = 'log' | 'info' | 'warn' | 'error' | 'debug';
const METHODS: ConsoleMethod[] = ['log', 'info', 'warn', 'error', 'debug'];

let stream: WriteStream | null = null;

function resolveLogFileFromArgs(argv: string[], env: NodeJS.ProcessEnv): string | null {
  if (env.SHELLY_LOG_FILE) {
    return env.SHELLY_LOG_FILE;
  }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--log-file') {
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) return next;
      return DEFAULT_LOG_PATH;
    }
    if (arg.startsWith('--log-file=')) {
      const value = arg.slice('--log-file='.length);
      return value || DEFAULT_LOG_PATH;
    }
  }
  return null;
}

function initFileLogging(argv: string[] = process.argv, env: NodeJS.ProcessEnv = process.env): string | null {
  const requested = resolveLogFileFromArgs(argv, env);
  if (!requested) return null;

  const absPath = isAbsolute(requested) ? requested : join(PROJECT_ROOT, requested);
  const dir = dirname(absPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  stream = createWriteStream(absPath, { flags: 'a' });

  for (const method of METHODS) {
    const original = console[method].bind(console);
    console[method] = (...args: unknown[]) => {
      original(...args);
      if (stream) {
        const line = `${new Date().toISOString()} [${method.toUpperCase()}] ${format(...args)}\n`;
        stream.write(line);
      }
    };
  }

  console.log(`File logging enabled: ${absPath}`);
  return absPath;
}

export function closeFileLogging(): void {
  if (stream) {
    stream.end();
    stream = null;
  }
}

initFileLogging();
