import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { LlmExtractor } from '../extraction/llm-extractor.js';
import { AnthropicLlmClient } from '../extraction/llm/anthropic-client.js';
import { OpenAiLlmClient } from '../extraction/llm/openai-client.js';
import { createFileResolver } from '../extraction/resolve-file.js';
import { LocalDiskStorage } from '../storage/file-storage.js';

/** apps/api/test/recordings: real-shaped Messages API response bodies, one per fixture. */
const RECORDINGS_DIR = fileURLToPath(new URL('../../test/recordings/', import.meta.url));
/** The repo's fixtures/ folder (seeded file paths are `fixtures/...`). */
export const FIXTURES_DIR = fileURLToPath(new URL('../../../../fixtures/', import.meta.url));

export const TEST_MODEL = 'claude-opus-5-5';
export const OPENAI_TEST_MODEL = 'gpt-4o-mini';
/** A fake key; tests assert it never appears in errors or stored rows. */
export const TEST_API_KEY = 'sk-ant-test-key-never-logged-0000';

export function loadRecording(name: string): unknown {
  return JSON.parse(readFileSync(`${RECORDINGS_DIR}${name}.json`, 'utf8'));
}

/** One field of a recorded model reply, in the wire format the prompt asks for. */
export interface RecordedField {
  field: string;
  value: string | null;
  evidence: string | null;
  not_found_reason: string | null;
}

interface RecordedMessage {
  id: string;
  content: { type: string; text?: string }[];
  stop_reason: string;
  stop_details: unknown;
  [key: string]: unknown;
}

function asRecordedMessage(recording: unknown): RecordedMessage {
  const message = recording as RecordedMessage;
  if (typeof message.id !== 'string' || !Array.isArray(message.content)) {
    throw new Error('Not a recorded Messages API response');
  }
  return message;
}

function recordedText(message: RecordedMessage): string {
  const text = message.content.find((block) => block.type === 'text')?.text;
  if (text === undefined) throw new Error(`Recording ${message.id} has no text block`);
  return text;
}

/** The fields of a recorded reply, e.g. to derive a variant from it. */
export function recordedFields(name: string): RecordedField[] {
  const parsed = JSON.parse(recordedText(asRecordedMessage(loadRecording(name)))) as {
    fields: RecordedField[];
  };
  return parsed.fields;
}

/**
 * A variant of a real recording: same envelope (model, usage, thinking block), with the fields
 * rewritten by `editFields`, or a refusal. Variants stay typed, so no JSON is hand-copied.
 */
export function buildRecording(
  base: string,
  changes: {
    id: string;
    editFields?: (fields: RecordedField[]) => RecordedField[];
    refusal?: { category: string };
  },
): RecordedMessage {
  const message = asRecordedMessage(loadRecording(base));
  if (changes.refusal) {
    return {
      ...message,
      id: changes.id,
      content: message.content.filter((block) => block.type !== 'text'),
      stop_reason: 'refusal',
      stop_details: { type: 'refusal', category: changes.refusal.category, explanation: null },
    };
  }
  const fields = (changes.editFields ?? ((same) => same))(recordedFields(base));
  return {
    ...message,
    id: changes.id,
    content: message.content.map((block) =>
      block.type === 'text' ? { ...block, text: JSON.stringify({ fields }) } : block,
    ),
  };
}

/**
 * An OpenAI `chat.completion` body carrying the fields of an Anthropic recording (optionally
 * edited), or a refusal. Synthesised: a live `LLM_RECORD=1` run with an OpenAI key saves real
 * ones under test/recordings/openai/.
 */
export function openAiRecording(
  base: string,
  changes: {
    id: string;
    editFields?: (fields: RecordedField[]) => RecordedField[];
    refusal?: string;
    finishReason?: 'stop' | 'length' | 'content_filter';
    content?: string;
  },
) {
  const fields = (changes.editFields ?? ((same) => same))(recordedFields(base));
  return {
    id: changes.id,
    object: 'chat.completion',
    created: 1_763_000_000,
    model: 'gpt-4o-mini-2024-07-18',
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content: changes.refusal ? null : (changes.content ?? JSON.stringify({ fields })),
          refusal: changes.refusal ?? null,
          annotations: [],
        },
        logprobs: null,
        finish_reason: changes.finishReason ?? 'stop',
      },
    ],
    usage: { prompt_tokens: 905, completion_tokens: 212, total_tokens: 1117 },
    system_fingerprint: 'fp_recorded',
  };
}

/** Replaces the named fields of a recorded reply. */
export function overrideFields(
  overrides: Record<string, Partial<RecordedField>>,
): (fields: RecordedField[]) => RecordedField[] {
  return (fields) => fields.map((f) => ({ ...f, ...overrides[f.field] }));
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
    const type = promptOf(call).match(/^Document type: (.+)$/m)?.[1] as
      keyof typeof recordings | undefined;
    const name = type ? recordings[type] : undefined;
    return name
      ? jsonResponse(200, loadRecording(name))
      : jsonResponse(500, { error: 'no recording' });
  };
}

/** The user prompt (document text included) of a recorded request, for either provider. */
export function promptOf(call: RecordedCall): string {
  const messages = call.body.messages as { role?: string; content: string }[] | undefined;
  return (messages?.find((m) => m.role === 'user') ?? messages?.[0])?.content ?? '';
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

/**
 * The production pipeline for uploaded files: real PDF parsing of what the API stored, the real
 * SDK client, and replies from `respond`. `delayMs` holds a reply back (e.g. to upload a newer
 * version while this one is still running).
 */
export function uploadsExtractor(
  storageDir: string,
  respond: (call: RecordedCall, index: number) => Response,
  options: { delayMs?: (call: RecordedCall) => number; provider?: 'anthropic' | 'openai' } = {},
) {
  const replay = replayFetch(respond);
  const fetch: typeof globalThis.fetch = async (input, init) => {
    const delay = options.delayMs?.({
      url: String(input),
      body: JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>,
      headers: new Headers(init?.headers),
    });
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
    return replay.fetch(input, init);
  };
  const extractor = new LlmExtractor({
    llm:
      options.provider === 'openai'
        ? new OpenAiLlmClient({
            apiKey: TEST_API_KEY,
            model: OPENAI_TEST_MODEL,
            timeoutMs: 5000,
            fetch,
          })
        : new AnthropicLlmClient({
            apiKey: TEST_API_KEY,
            model: TEST_MODEL,
            timeoutMs: 5000,
            fetch,
          }),
    resolveFile: createFileResolver(new LocalDiskStorage(storageDir), FIXTURES_DIR),
    maxDocumentChars: 100_000,
  });
  return { extractor, calls: replay.calls };
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
