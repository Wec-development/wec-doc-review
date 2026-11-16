/**
 * Polls `condition` until it holds. Bounded: fails with `description` after `timeoutMs`, so a
 * broken scenario fails fast instead of hanging the suite.
 */
export async function waitFor(
  condition: () => Promise<boolean>,
  options: { timeoutMs?: number; intervalMs?: number; description?: string } = {},
): Promise<void> {
  const { timeoutMs = 5000, intervalMs = 20, description = 'condition' } = options;
  const deadline = Date.now() + timeoutMs;
  while (!(await condition())) {
    if (Date.now() > deadline) {
      throw new Error(`Timed out after ${timeoutMs} ms waiting for ${description}`);
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}
