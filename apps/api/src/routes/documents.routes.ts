import { createReadStream } from 'node:fs';
import { createDocumentFieldsSchema } from '@doc-review/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { readPdfForm } from '../http/multipart.js';
import {
  createDocument,
  createVersion,
  getDocument,
  getProgress,
  getVersionFile,
  listDocuments,
  retryVersion,
} from '../services/documents.service.js';
import type { ServiceDeps } from '../services/deps.js';
import { toDocumentDetailDto, toDocumentSummaryDto } from './presenters.js';

const documentParamsSchema = z.object({ id: z.uuid('Document id must be a UUID') });
const versionQuerySchema = z.object({
  version: z.coerce.number().int().positive().optional(),
});

export function registerDocumentRoutes(app: FastifyInstance, deps: ServiceDeps): void {
  // 202: the upload is stored and queued; extraction runs later in the worker.
  app.post('/documents', async (request, reply) => {
    const form = await readPdfForm(request);
    const fields = createDocumentFieldsSchema.parse(form.fields);
    const accepted = await createDocument(deps, {
      type: fields.type,
      title: fields.title,
      file: form.file,
    });
    return reply.code(202).send(accepted);
  });

  app.post('/documents/:id/versions', async (request, reply) => {
    const { id } = documentParamsSchema.parse(request.params);
    const form = await readPdfForm(request);
    const accepted = await createVersion(deps, id, form.file);
    return reply.code(202).send(accepted);
  });

  app.get('/documents', async () => {
    const documents = await listDocuments(deps);
    return { documents: documents.map(toDocumentSummaryDto) };
  });

  app.get('/documents/:id', async (request) => {
    const { id } = documentParamsSchema.parse(request.params);
    const { version } = versionQuerySchema.parse(request.query);
    return toDocumentDetailDto(await getDocument(deps, id, version));
  });

  app.get('/documents/:id/progress', async (request) => {
    const { id } = documentParamsSchema.parse(request.params);
    const { version } = versionQuerySchema.parse(request.query);
    return getProgress(deps, id, version);
  });

  // The uploaded PDF itself, shown inline by the browser's PDF viewer (read-only).
  app.get('/documents/:id/file', async (request, reply) => {
    const { id } = documentParamsSchema.parse(request.params);
    const { version } = versionQuerySchema.parse(request.query);
    const file = await getVersionFile(deps, id, version);
    return reply
      .type('application/pdf')
      .header('content-length', file.size)
      .header('content-disposition', `inline; filename="${file.fileName}"`)
      .header('x-content-type-options', 'nosniff')
      .header('cache-control', 'private, no-cache')
      .send(createReadStream(file.path));
  });

  app.post('/documents/:id/retry', async (request, reply) => {
    const { id } = documentParamsSchema.parse(request.params);
    return reply.code(202).send(await retryVersion(deps, id));
  });
}
