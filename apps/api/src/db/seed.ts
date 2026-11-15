import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { documentTypeSchema } from '@doc-review/shared';
import { z } from 'zod';
import type { Transaction } from './client.js';
import { documents, documentVersions, extractionJobs } from './schema.js';

const SEEDED_VERSION_NO = 1;

const fixtureVersionSchema = z.object({
  version: z.number().int().positive(),
  file: z.string().min(1),
});

const fixtureDocumentSchema = z.object({
  id: z.string().min(1),
  type: documentTypeSchema,
  title: z.string().min(1),
  versions: z
    .array(fixtureVersionSchema)
    .refine((versions) => versions.some((v) => v.version === SEEDED_VERSION_NO), {
      message: `Each fixture document needs a version ${SEEDED_VERSION_NO}`,
    }),
});

export const fixtureManifestSchema = z.array(fixtureDocumentSchema);
export type FixtureManifest = z.infer<typeof fixtureManifestSchema>;
type FixtureDocument = FixtureManifest[number];

export interface SeedSummary {
  inserted: string[];
  skipped: string[];
}

export async function readFixtureManifest(fixturesDir: string): Promise<FixtureManifest> {
  const manifestPath = path.join(fixturesDir, 'documents.json');
  const raw: unknown = JSON.parse(await readFile(manifestPath, 'utf8'));
  return fixtureManifestSchema.parse(raw);
}

/** Paths are stored relative to the repo root, e.g. fixtures/documents/invoice-001.pdf. */
function fixtureFilePath(file: string): string {
  return path.posix.join('fixtures', file);
}

function firstVersionFile(fixture: FixtureDocument): string {
  const first = fixture.versions.find((v) => v.version === SEEDED_VERSION_NO);
  if (!first) {
    throw new Error(`Fixture ${fixture.id} has no version ${SEEDED_VERSION_NO}`);
  }
  return first.file;
}

/** Returns false when a document with this fixture key already exists. */
async function seedDocument(tx: Transaction, fixture: FixtureDocument): Promise<boolean> {
  const [document] = await tx
    .insert(documents)
    .values({ type: fixture.type, title: fixture.title, fixtureKey: fixture.id })
    .onConflictDoNothing({ target: documents.fixtureKey })
    .returning({ id: documents.id });

  if (!document) {
    return false;
  }

  const [version] = await tx
    .insert(documentVersions)
    .values({
      documentId: document.id,
      versionNo: SEEDED_VERSION_NO,
      filePath: fixtureFilePath(firstVersionFile(fixture)),
    })
    .returning({ id: documentVersions.id });

  if (!version) {
    throw new Error(`Inserting version ${SEEDED_VERSION_NO} of ${fixture.id} returned no row`);
  }

  await tx.insert(extractionJobs).values({ versionId: version.id });
  return true;
}

/**
 * Inserts version 1 of each fixture document plus one queued extraction job. Runs inside the
 * caller's transaction; documents that already exist (by fixture key) are skipped, so re-running
 * is safe.
 */
export async function seedFixtures(
  tx: Transaction,
  manifest: FixtureManifest,
): Promise<SeedSummary> {
  const summary: SeedSummary = { inserted: [], skipped: [] };
  for (const fixture of manifest) {
    const wasInserted = await seedDocument(tx, fixture);
    (wasInserted ? summary.inserted : summary.skipped).push(fixture.id);
  }
  return summary;
}
