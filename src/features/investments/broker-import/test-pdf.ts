import * as fs from 'fs';
import { parseBrokerPdf } from './pdf-parser';

async function run() {
  if (process.env.NODE_ENV === 'production') {
    console.error('This script cannot be run in production.');
    process.exit(1);
  }

  const args = process.argv.slice(2);
  const filePath = args[0];
  const isRaw = args.includes('--raw');

  if (!filePath) {
    console.error('Usage: npx tsx src/features/investments/broker-import/test-pdf.ts <path-to-pdf> [--raw]');
    process.exit(1);
  }

  try {
    const buffer = fs.readFileSync(filePath);
    const result = await parseBrokerPdf(buffer);

    console.log('--- PDF EXTRACTION SPIKE RESULTS ---');
    console.log(`Pages: ${result.pages}`);
    console.log(`Fingerprint (SHA-256): ${result.fingerprint}`);
    console.log('------------------------------------');
    
    if (isRaw) {
      console.log('RAW TEXT (First 1000 chars):');
      console.log(result.rawText.substring(0, 1000));
    } else {
      console.log('SANITIZED / STRUCTURAL TEXT (First 1000 chars):');
      console.log(result.sanitizedText.substring(0, 1000));
    }
  } catch (error: any) {
    console.error('Error during extraction spike:', error.message);
  }
}

run();
