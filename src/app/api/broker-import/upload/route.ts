import { NextRequest, NextResponse } from 'next/server';
import { getUserId } from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    const userId = await getUserId();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await req.formData();
    const fileField = formData.get('file');

    // Guard: must be a Blob/File (has .arrayBuffer), not a plain string field
    if (
      !fileField ||
      typeof fileField === 'string' ||
      typeof (fileField as Blob).arrayBuffer !== 'function'
    ) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const file = fileField as File;

    if (file.size === 0) {
      return NextResponse.json({ error: 'File is empty' }, { status: 400 });
    }

    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: 'FILE_TOO_LARGE' }, { status: 413 });
    }

    if (file.type !== 'application/pdf') {
      return NextResponse.json({ error: 'INVALID_FILE_TYPE' }, { status: 415 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const { extractBrokerSnapshot } = await import(
      '@/features/investments/broker-import/orchestrator'
    );
    const snapshot = await extractBrokerSnapshot(buffer);
    return NextResponse.json(snapshot);
  } catch (error: unknown) {
    const err = error as Error;
    if (err.message === 'ENCRYPTED_DOCUMENT') {
      return NextResponse.json({ error: 'ENCRYPTED_DOCUMENT' }, { status: 422 });
    }
    if (err.message === 'INVALID_PDF_SIGNATURE') {
      return NextResponse.json({ error: 'INVALID_PDF_SIGNATURE' }, { status: 415 });
    }
    if (err.message === 'PAGE_LIMIT_EXCEEDED') {
      return NextResponse.json({ error: 'PAGE_LIMIT_EXCEEDED' }, { status: 413 });
    }
    // Do NOT leak internal error messages to the client
    console.error('[broker-import/upload] Unhandled error:', err);
    return NextResponse.json({ error: 'PDF_EXTRACTION_FAILED' }, { status: 500 });
  }
}
