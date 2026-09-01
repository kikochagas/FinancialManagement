import { sanitizeDocumentToShapes } from '../broker-import/sanitizer';
import { describe, it, expect } from 'vitest';

describe('sanitizer', () => {
  it('masks ISINs and numbers', () => {
    const raw = "Apple Inc. US0378331005 1,500.00\nTotal Cash $5,000.50";
    const res = sanitizeDocumentToShapes(raw);
    expect(res).toContain('<ISIN>');
    expect(res).toContain('<DECIMAL>');
    expect(res).not.toContain('US0378331005');
  });

  it('masks PII like email and arbitrary text', () => {
    const raw = "John Doe john.doe@example.com\n123 Main St, Springfield\nAccount 987654321";
    const res = sanitizeDocumentToShapes(raw);
    expect(res).toContain('<EMAIL>');
    expect(res).not.toContain('john.doe@example.com');
    expect(res).not.toContain('John');
    expect(res).toContain('<TEXT_VALUE>');
    // Ensure 'account' is whitelisted, but '987654321' is masked
    expect(res.toLowerCase()).toContain('account');
    expect(res).not.toContain('987654321');
  });
});
