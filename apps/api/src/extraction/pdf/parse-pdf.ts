import { readFile } from 'node:fs/promises';
import { getDocument, PasswordException } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { PermanentError } from '../errors.js';

export const NO_TEXT_REASON = 'No extractable text — scanned PDFs are not supported';

interface TextItemLike {
  str: string;
  hasEOL: boolean;
}

function isTextItem(item: unknown): item is TextItemLike {
  return typeof item === 'object' && item !== null && 'str' in item && 'hasEOL' in item;
}

/**
 * PDF bytes -> text, exactly as PDF.js lays it out: text items in reading order, a line break
 * where PDF.js reports one, and a line break between pages. This raw text is what gets stored
 * on the version and what evidence is verified against; it is never normalised.
 */
export async function parsePdfBytes(bytes: Uint8Array, maxChars: number): Promise<string> {
  let text = '';
  // verbosity 0: PDF.js warnings (font fallbacks etc.) would otherwise go to the console.
  const loadingTask = getDocument({ data: bytes, useSystemFonts: false, verbosity: 0 });
  try {
    const document = await loadingTask.promise;
    try {
      for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
        const page = await document.getPage(pageNumber);
        const content = await page.getTextContent();
        for (const item of content.items) {
          if (isTextItem(item)) {
            text += item.str + (item.hasEOL ? '\n' : '');
          }
        }
        if (pageNumber < document.numPages) text += '\n';
        if (text.length > maxChars) {
          throw new PermanentError(
            `Document text exceeds the ${maxChars.toLocaleString('en-US')} character limit`,
          );
        }
      }
    } finally {
      await loadingTask.destroy();
    }
  } catch (error) {
    if (error instanceof PermanentError) throw error;
    if (error instanceof PasswordException) {
      throw new PermanentError('PDF is encrypted (password protected)', { cause: error });
    }
    throw new PermanentError('PDF could not be read', { cause: error });
  }

  if (text.trim().length === 0) {
    throw new PermanentError(NO_TEXT_REASON);
  }
  return text;
}

export async function parsePdfFile(filePath: string, maxChars: number): Promise<string> {
  let bytes: Buffer;
  try {
    bytes = await readFile(filePath);
  } catch (error) {
    throw new PermanentError('Stored PDF file not found', { cause: error });
  }
  return parsePdfBytes(new Uint8Array(bytes), maxChars);
}
