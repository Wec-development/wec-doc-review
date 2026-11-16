import { liveTestCredentials } from './live-credentials.js';
import { CURATED_MODELS, extractionModelOptions, listAvailableModels } from './modelCatalog.js';

/**
 * `pnpm --filter @doc-review/api llm:models`: verifies the curated catalogue against the live
 * list-models response for one key. Prints model IDs only; the key is never printed.
 */
const { provider, apiKey } = liveTestCredentials();
const available = await listAvailableModels(provider, apiKey);
const options = extractionModelOptions(provider, available);
const availableIds = new Set(available.map((model) => model.id));

console.info(`Provider: ${provider}`);
console.info(`Models returned by the key: ${available.length}`);
console.info('Usable for extraction (filtered, in order):');
for (const option of options) {
  console.info(`  ${option.recommended ? '*' : ' '} ${option.id} — ${option.label}`);
}
console.info('Curated models and whether this key has them:');
for (const curated of CURATED_MODELS[provider]) {
  console.info(`  ${availableIds.has(curated.id) ? 'yes' : 'NO '} ${curated.id}`);
}
console.info(`Default that Settings would pre-select: ${options[0]?.id ?? '(none)'}`);
