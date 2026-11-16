import type { ExtractionDiagnostics, ExtractionResult } from '@doc-review/shared';
import { ExtractionError, RetryableError } from './errors.js';
import type { ExtractionInput, Extractor } from './extractor.js';
import type { LlmClient, WithRawResponse } from './llm/llm-client.js';
import { parsePdfFile } from './pdf/parse-pdf.js';
import { buildPrompt, PROMPT_VERSION, renderPromptForStorage } from './prompt/build-prompt.js';
import { parseModelOutput } from './validate/parse-model-output.js';
import { verifyFields } from './validate/verify-fields.js';

export interface LlmExtractorDeps {
  /**
   * The client for this job, resolved per call: the provider, model and key come from the
   * saved settings, so a change applies to the next job without a restart.
   */
  llm: () => Promise<LlmClient>;
  /** file_path from the version row -> absolute path to read. */
  resolveFile: (filePath: string) => string;
  maxDocumentChars: number;
}

/**
 * PDF -> raw text -> one structured LLM call -> code-side verification -> values and gaps.
 * Exactly one model call per attempt. Any failure after the prompt is built carries the prompt,
 * prompt version, raw response and usage, so they are stored on the job even when it fails.
 */
export class LlmExtractor implements Extractor {
  constructor(private readonly deps: LlmExtractorDeps) {}

  async extract({ documentType, filePath, signal }: ExtractionInput): Promise<ExtractionResult> {
    const parsedText = await parsePdfFile(
      this.deps.resolveFile(filePath),
      this.deps.maxDocumentChars,
    );
    const prompt = buildPrompt(documentType, parsedText);
    const llm = await this.deps.llm();
    const diagnostics: ExtractionDiagnostics = {
      prompt: renderPromptForStorage(prompt),
      promptVersion: PROMPT_VERSION,
      provider: llm.provider,
      model: llm.model,
      rawResponse: null,
      usage: null,
      durationMs: null,
    };

    const startedAt = performance.now();
    try {
      const response = await llm.extractFields({ ...prompt, signal });
      Object.assign(diagnostics, {
        model: response.model,
        rawResponse: response.raw,
        usage: response.usage,
        durationMs: Math.round(performance.now() - startedAt),
      });
      const claims = parseModelOutput(documentType, response.output);
      const fields = verifyFields(documentType, claims, parsedText);
      return { ...diagnostics, fields, parsedText };
    } catch (error) {
      throw withDiagnostics(error, diagnostics, startedAt);
    }
  }
}

function withDiagnostics(
  error: unknown,
  diagnostics: ExtractionDiagnostics,
  startedAt: number,
): ExtractionError {
  const extractionError =
    error instanceof ExtractionError
      ? error
      : new RetryableError(error instanceof Error ? error.message : String(error), {
          cause: error,
        });
  const fromClient = error as WithRawResponse;
  extractionError.diagnostics = {
    ...diagnostics,
    rawResponse: diagnostics.rawResponse ?? fromClient.rawResponse ?? null,
    usage: diagnostics.usage ?? fromClient.usage ?? null,
    durationMs: diagnostics.durationMs ?? Math.round(performance.now() - startedAt),
  };
  return extractionError;
}
