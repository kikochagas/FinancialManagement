import { BrokerSnapshot } from './schema';
import { parseBrokerPdf } from './pdf-parser';
import { extractDeterministic } from './deterministic-extractor';

export async function extractBrokerSnapshot(buffer: Buffer): Promise<BrokerSnapshot> {
  const parsed = await parseBrokerPdf(buffer);
  
  // Use deterministic extraction
  const snapshot = extractDeterministic(parsed.rawText);
  snapshot.documentFingerprint = parsed.fingerprint;
  return snapshot;
}
