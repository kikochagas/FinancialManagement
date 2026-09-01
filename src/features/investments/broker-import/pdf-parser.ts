import { PDFParse, PasswordException } from 'pdf-parse';
import crypto from 'crypto';
import { sanitizeDocumentToShapes } from './sanitizer';

const PAGE_LIMIT = 50;

export async function parseBrokerPdf(buffer: Buffer) {
  // 1. Fast magic-bytes check before handing to the parser
  if (buffer.length < 5 || buffer.slice(0, 5).toString('ascii') !== '%PDF-') {
    throw new Error('INVALID_PDF_SIGNATURE');
  }

  let parser: InstanceType<typeof PDFParse> | undefined;
  try {
    parser = new PDFParse({ data: buffer });

    // 2. Get document metadata / page count first — cheap call
    const info = await parser.getInfo();
    const pages: number = info.total ?? 0;

    if (pages > PAGE_LIMIT) {
      throw new Error('PAGE_LIMIT_EXCEEDED');
    }

    // 3. Extract text
    const textResult = await parser.getText();
    const rawText: string = textResult.text ?? '';

    const fingerprint = crypto.createHash('sha256').update(buffer).digest('hex');

    return {
      rawText,
      sanitizedText: sanitizeDocumentToShapes(rawText),
      pages,
      fingerprint,
    };
  } catch (error: unknown) {
    const err = error as Error & { name?: string };
    // Re-throw known sentinel errors without wrapping
    if (err.message === 'PAGE_LIMIT_EXCEEDED') throw error;
    if (err.message === 'INVALID_PDF_SIGNATURE') throw error;
    // pdf-parse uses PasswordException for encrypted docs
    if (error instanceof PasswordException) {
      throw new Error('ENCRYPTED_DOCUMENT');
    }
    // Fallback heuristic for older pdfjs error names
    if (
      err.name === 'PasswordException' ||
      err.message?.toLowerCase().includes('password') ||
      err.message?.toLowerCase().includes('encrypted')
    ) {
      throw new Error('ENCRYPTED_DOCUMENT');
    }
    throw new Error('PDF_EXTRACTION_FAILED');
  } finally {
    if (parser) {
      await parser.destroy();
    }
  }
}
