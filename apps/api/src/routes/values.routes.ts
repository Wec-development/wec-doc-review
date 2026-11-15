import { reviewRequestSchema } from '@doc-review/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { ServiceDeps } from '../services/deps.js';
import { reviewValue } from '../services/reviews.service.js';
import { toValueDto } from './presenters.js';

const valueParamsSchema = z.object({ id: z.uuid('Value id must be a UUID') });

export function registerValueRoutes(app: FastifyInstance, deps: ServiceDeps): void {
  // 201: a new review row is created; the extracted value itself is never modified.
  app.post('/values/:id/review', async (request, reply) => {
    const { id } = valueParamsSchema.parse(request.params);
    const review = reviewRequestSchema.parse(request.body);
    const updated = await reviewValue(deps, id, review);
    return reply.code(201).send(toValueDto(updated));
  });
}
