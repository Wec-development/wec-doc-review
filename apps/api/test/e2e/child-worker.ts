import { type ChildProcess, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { inject } from 'vitest';

const API_DIR = fileURLToPath(new URL('../../', import.meta.url));
const WORKER_ENTRY = fileURLToPath(new URL('../../src/worker/index.ts', import.meta.url));
const EXIT_TIMEOUT_MS = 10_000;
const running = new Set<ChildProcess>();

/** Kills every worker process a test started and did not stop (e.g. after a failed assertion). */
export function killWorkerProcesses(): void {
  for (const child of running) child.kill('SIGKILL');
  running.clear();
}

/**
 * Runs the real worker entry point (`src/worker/index.ts`) as its own process against the test
 * database, so a crash can be a real SIGKILL. It uses the fake extractor with a long delay, so
 * it is always mid-extraction when killed. Only the variables listed here are passed: the
 * child never reads .env or inherits the parent's settings.
 */
export function startWorkerProcess() {
  // node --import tsx (not the tsx CLI, which runs the script in a grandchild process), so the
  // signal reaches the worker itself and its pid is the one in its worker id.
  const child = spawn(process.execPath, ['--import', 'tsx', WORKER_ENTRY], {
    cwd: API_DIR,
    env: {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      DATABASE_URL: inject('databaseUrl'),
      EXTRACTOR: 'fake',
      FAKE_EXTRACTOR_DELAY_MS: '60000',
      WORKER_CONCURRENCY: '1',
      WORKER_POLL_INTERVAL_MS: '50',
      JOB_LEASE_SECONDS: '30',
      WORKER_SHUTDOWN_TIMEOUT_MS: '100',
    },
    stdio: 'ignore',
  });
  running.add(child);
  const exited = new Promise<number | null>((resolve) =>
    child.once('exit', (code) => {
      running.delete(child);
      resolve(code);
    }),
  );
  if (child.pid === undefined) throw new Error('Worker process did not start');

  return {
    pid: child.pid,
    /** Sends `signal` and resolves with the exit code (null when killed by the signal). */
    async kill(signal: 'SIGKILL' | 'SIGTERM'): Promise<number | null> {
      child.kill(signal);
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error(`Worker process did not exit after ${signal}`)),
          EXIT_TIMEOUT_MS,
        ).unref(),
      );
      return Promise.race([exited, timeout]);
    },
  };
}
