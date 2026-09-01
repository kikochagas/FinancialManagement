/**
 * Infrastructure tests for /api/broker-import/upload route handler.
 *
 * Covers:
 *  - unauthenticated request → 401
 *  - missing file → 400
 *  - non-File form field → 400
 *  - oversized file → 413
 *  - wrong MIME type → 415
 *  - invalid PDF signature → 415
 *  - encrypted document → 422
 *  - page limit exceeded → 413
 *  - unknown internal error → 500 with opaque message (PDF_EXTRACTION_FAILED)
 *  - successful extraction → 200 with snapshot
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
vi.mock('@/lib/auth', () => ({
  getUserId: vi.fn(),
}));

vi.mock('@/features/investments/broker-import/orchestrator', () => ({
  extractBrokerSnapshot: vi.fn(),
}));

import { getUserId } from '@/lib/auth';
import { extractBrokerSnapshot } from '@/features/investments/broker-import/orchestrator';
import { POST } from '@/app/api/broker-import/upload/route';

const mockGetUserId = getUserId as ReturnType<typeof vi.fn>;
const mockExtract = extractBrokerSnapshot as ReturnType<typeof vi.fn>;

const PDF_MAGIC = '%PDF-1.4 stub content for testing';

function makeRequest(file?: File | null | string): NextRequest {
  const form = new FormData();
  if (file !== undefined && file !== null) {
    if (typeof file === 'string') {
      form.append('file', file); // string, not a File
    } else {
      form.append('file', file);
    }
  }
  return new NextRequest('http://localhost/api/broker-import/upload', {
    method: 'POST',
    body: form,
  });
}

function makeFile(content: string, type = 'application/pdf', name = 'statement.pdf') {
  return new File([content], name, { type });
}

function makeLargeFile(sizeBytes: number) {
  const content = '%PDF-' + 'x'.repeat(sizeBytes - 5);
  return new File([content], 'large.pdf', { type: 'application/pdf' });
}

describe('POST /api/broker-import/upload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUserId.mockResolvedValue('user-123');
  });

  it('returns 401 when unauthenticated', async () => {
    mockGetUserId.mockResolvedValue(null);
    const req = makeRequest(makeFile(PDF_MAGIC));
    const res = await POST(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('Unauthorized');
  });

  it('returns 400 when no file field', async () => {
    const req = makeRequest(null);
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('returns 400 when file field is a plain string (not a File)', async () => {
    const req = makeRequest('not-a-file');
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('returns 413 when file exceeds 5 MB', async () => {
    // The jsdom/undici environment cannot reliably handle 5MB+ Blob bodies.
    // Spy on formData() to inject a mock file with a spoofed .size value.
    const fakeFile = {
      size: 5 * 1024 * 1024 + 1,
      type: 'application/pdf',
      arrayBuffer: async () => new ArrayBuffer(0),
    };
    const fakeFormData = { get: (key: string) => key === 'file' ? fakeFile : null };
    const req = makeRequest(makeFile(PDF_MAGIC));
    vi.spyOn(req, 'formData').mockResolvedValue(fakeFormData as any);
    const res = await POST(req);
    expect(res.status).toBe(413);
    const body = await res.json();
    expect(body.error).toBe('FILE_TOO_LARGE');
  });

  it('returns 415 when MIME type is not application/pdf', async () => {
    const file = new File([PDF_MAGIC], 'statement.txt', { type: 'text/plain' });
    const req = makeRequest(file);
    const res = await POST(req);
    expect(res.status).toBe(415);
    const body = await res.json();
    expect(body.error).toBe('INVALID_FILE_TYPE');
  });

  it('returns 415 for invalid PDF signature (orchestrator rejects non-PDF bytes)', async () => {
    mockExtract.mockRejectedValue(new Error('INVALID_PDF_SIGNATURE'));
    const file = new File(['not a real pdf'], 'fake.pdf', { type: 'application/pdf' });
    const req = makeRequest(file);
    const res = await POST(req);
    expect(res.status).toBe(415);
    const body = await res.json();
    expect(body.error).toBe('INVALID_PDF_SIGNATURE');
  });

  it('returns 422 for encrypted document', async () => {
    mockExtract.mockRejectedValue(new Error('ENCRYPTED_DOCUMENT'));
    const file = makeFile(PDF_MAGIC);
    const req = makeRequest(file);
    const res = await POST(req);
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe('ENCRYPTED_DOCUMENT');
  });

  it('returns 413 for page limit exceeded', async () => {
    mockExtract.mockRejectedValue(new Error('PAGE_LIMIT_EXCEEDED'));
    const file = makeFile(PDF_MAGIC);
    const req = makeRequest(file);
    const res = await POST(req);
    expect(res.status).toBe(413);
    const body = await res.json();
    expect(body.error).toBe('PAGE_LIMIT_EXCEEDED');
  });

  it('returns 500 with opaque PDF_EXTRACTION_FAILED for unknown errors (does not leak internal message)', async () => {
    mockExtract.mockRejectedValue(new Error('Some internal database error with secrets'));
    const file = makeFile(PDF_MAGIC);
    const req = makeRequest(file);
    const res = await POST(req);
    expect(res.status).toBe(500);
    const body = await res.json();
    // Must NOT include the internal message
    expect(body.error).toBe('PDF_EXTRACTION_FAILED');
    expect(JSON.stringify(body)).not.toContain('secrets');
  });

  it('returns 200 with snapshot on success', async () => {
    const fakeSnapshot = { positions: [], cashBalances: [], totals: [], completeness: 'COMPLETE' };
    mockExtract.mockResolvedValue(fakeSnapshot);
    const file = makeFile(PDF_MAGIC);
    const req = makeRequest(file);
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.completeness).toBe('COMPLETE');
  });
});
