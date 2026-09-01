/**
 * Infrastructure tests for pdf-parser.ts
 *
 * We exercise the pdf-parse 2.x integration without hitting a real broker PDF:
 *  - magic-bytes gate rejects non-PDF buffers before the parser runs
 *  - valid minimal PDF parses and returns expected shape
 *  - page-limit enforcement
 *  - PasswordException → ENCRYPTED_DOCUMENT mapping
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock pdf-parse so tests are fast and deterministic
// ---------------------------------------------------------------------------
const mockGetInfo = vi.fn();
const mockGetText = vi.fn();
const mockDestroy = vi.fn();

vi.mock('pdf-parse', () => {
  class MockPasswordException extends Error {
    constructor(msg: string) {
      super(msg);
      this.name = 'PasswordException';
    }
  }

  class MockPDFParse {
    constructor(_opts: { data: Buffer }) {}
    getInfo = mockGetInfo;
    getText = mockGetText;
    destroy = mockDestroy;
  }

  return {
    PDFParse: MockPDFParse,
    PasswordException: MockPasswordException,
  };
});

import { parseBrokerPdf } from '../broker-import/pdf-parser';

const VALID_PDF_MAGIC = Buffer.from('%PDF-1.4 stub');

describe('parseBrokerPdf', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDestroy.mockResolvedValue(undefined);
  });

  it('rejects a buffer that does not start with %PDF-', async () => {
    const buf = Buffer.from('not a pdf');
    await expect(parseBrokerPdf(buf)).rejects.toThrow('INVALID_PDF_SIGNATURE');
    // Parser constructor was never reached, so destroy was never called
    expect(mockGetInfo).not.toHaveBeenCalled();
  });

  it('rejects an empty buffer', async () => {
    await expect(parseBrokerPdf(Buffer.alloc(0))).rejects.toThrow('INVALID_PDF_SIGNATURE');
  });

  it('parses a valid PDF and returns expected shape', async () => {
    mockGetInfo.mockResolvedValue({ total: 3 });
    mockGetText.mockResolvedValue({ text: 'Portfolio Summary\nApple Inc 100 shares' });

    const result = await parseBrokerPdf(VALID_PDF_MAGIC);

    expect(result.pages).toBe(3);
    expect(result.rawText).toContain('Apple Inc');
    expect(typeof result.fingerprint).toBe('string');
    expect(result.fingerprint).toHaveLength(64); // sha256 hex
    expect(typeof result.sanitizedText).toBe('string');
    expect(mockDestroy).toHaveBeenCalled();
  });

  it('rejects PDFs exceeding the 50-page limit', async () => {
    mockGetInfo.mockResolvedValue({ total: 51 });

    await expect(parseBrokerPdf(VALID_PDF_MAGIC)).rejects.toThrow('PAGE_LIMIT_EXCEEDED');
    // destroy must still be called
    expect(mockDestroy).toHaveBeenCalled();
  });

  it('maps PasswordException to ENCRYPTED_DOCUMENT', async () => {
    const { PasswordException } = await import('pdf-parse');
    mockGetInfo.mockRejectedValue(new PasswordException('Password required'));

    await expect(parseBrokerPdf(VALID_PDF_MAGIC)).rejects.toThrow('ENCRYPTED_DOCUMENT');
    expect(mockDestroy).toHaveBeenCalled();
  });

  it('maps unknown parser errors to PDF_EXTRACTION_FAILED', async () => {
    mockGetInfo.mockRejectedValue(new Error('Some internal pdfjs error'));

    await expect(parseBrokerPdf(VALID_PDF_MAGIC)).rejects.toThrow('PDF_EXTRACTION_FAILED');
    expect(mockDestroy).toHaveBeenCalled();
  });

  it('calls destroy even when getText throws', async () => {
    mockGetInfo.mockResolvedValue({ total: 2 });
    mockGetText.mockRejectedValue(new Error('Rendering failure'));

    await expect(parseBrokerPdf(VALID_PDF_MAGIC)).rejects.toThrow('PDF_EXTRACTION_FAILED');
    expect(mockDestroy).toHaveBeenCalled();
  });

  it('accepts exactly 50 pages (boundary)', async () => {
    mockGetInfo.mockResolvedValue({ total: 50 });
    mockGetText.mockResolvedValue({ text: 'ok' });

    const result = await parseBrokerPdf(VALID_PDF_MAGIC);
    expect(result.pages).toBe(50);
  });
});
