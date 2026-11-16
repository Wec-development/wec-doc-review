import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { LlmExtractor } from '../extraction/llm-extractor.js';
import { AnthropicLlmClient } from '../extraction/llm/anthropic-client.js';

/** apps/api/test/recordings: real-shaped Messages API response bodies, one per fixture. */
const RECORDINGS_DIR = fileURLToPath(new URL('../../test/recordings/', import.meta.url));
/** The repo's fixtures/ folder (seeded file paths are `fixtures/...`). */
export const FIXTURES_DIR = fileURLToPath(new URL('../../../../fixtures/', import.meta.url));

export const TEST_MODEL = 'claude-opus-5-5';
/** A fake key; tests assert it never appears in errors or stored rows. */
export const TEST_API_KEY = 'sk-ant-test-key-never-logged-0000';

export function loadRecording(name: string): unknown {
  return JSON.parse(readFileSync(`${RECORDINGS_DIR}${name}.json`, 'utf8'));
}

export function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'request-id': 'req_test' },
  });
}

export interface RecordedCall {
  url: string;
  body: Record<string, unknown>;
  headers: Headers;
}

/**
 * A `fetch` for the real Anthropic SDK client that never touches the network: each request is
 * answered by `respond`, and every request is recorded for assertions.
 */
export function replayFetch(respond: (call: RecordedCall, index: number) => Response) {
  const calls: RecordedCall[] = [];
  const fetch: typeof globalThis.fetch = async (input, init) => {
    const call: RecordedCall = {
      url: input instanceof Request ? input.url : String(input),
      body: JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>,
      headers: new Headers(init?.headers),
    };
    calls.push(call);
    return respond(call, calls.length - 1);
  };
  return { fetch, calls };
}

/** Picks the recording for the document type named in the prompt. */
export function respondByDocumentType(
  recordings: Partial<Record<'invoice' | 'lease' | 'market report', string>>,
) {
  return (call: RecordedCall): Response => {
    const messages = call.body.messages as { content: string }[] | undefined;
    const prompt = messages?.[0]?.content ?? '';
    const type = prompt.match(/^Document type: (.+)$/m)?.[1] as keyof typeof recordings | undefined;
    const name = type ? recordings[type] : undefined;
    return name
      ? jsonResponse(200, loadRecording(name))
      : jsonResponse(500, { error: 'no recording' });
  };
}

/** The prompt (document text included) of a recorded request. */
export function promptOf(call: RecordedCall): string {
  const messages = call.body.messages as { content: string }[] | undefined;
  return messages?.[0]?.content ?? '';
}

/**
 * Answers with the recording of the first rule whose marker appears in the prompt's document
 * text (e.g. "INVOICE (REVISED)" picks the v2 invoice reply).
 */
export function respondByDocumentText(rules: [marker: string, recording: string][]) {
  return (call: RecordedCall): Response => {
    const prompt = promptOf(call);
    const match = rules.find(([marker]) => prompt.includes(marker));
    return match
      ? jsonResponse(200, loadRecording(match[1]))
      : jsonResponse(500, { error: 'no recording' });
  };
}

/** The production pipeline (real PDF parser, real SDK client) answered by `fetch`. */
export function recordedLlmExtractor(fetch: typeof globalThis.fetch, maxDocumentChars = 100_000) {
  return new LlmExtractor({
    llm: new AnthropicLlmClient({
      apiKey: TEST_API_KEY,
      model: TEST_MODEL,
      timeoutMs: 5000,
      fetch,
    }),
    resolveFile: (filePath) => `${FIXTURES_DIR}${filePath.replace(/^fixtures\//, '')}`,
    maxDocumentChars,
  });
}

/** A structurally valid one-page PDF with no text at all, like a scanned image-only page. */
export function blankPdf(): Uint8Array {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = objects.map((body, i) => {
    const offset = pdf.length;
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
    return offset;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('');
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(pdf);
}
