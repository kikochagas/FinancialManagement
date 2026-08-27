import { describe, it, expect } from 'vitest';
import { parseNumber, parseDate, parseLegacyTransactionType } from '../utils';

describe('Reports Parser Utils', () => {
  describe('parseNumber', () => {
    it('should parse standard numbers', () => {
      expect(parseNumber(1234.56)).toBe(1234.56);
      expect(parseNumber('1234.56')).toBe(1234.56);
    });
    
    it('should parse European formatted numbers with commas', () => {
      expect(parseNumber('3,277,96')).toBe(3277.96);
      expect(parseNumber('1.234,56')).toBe(1234.56);
      expect(parseNumber('10,00')).toBe(10);
    });
    
    it('should strip currency symbols and spaces', () => {
      expect(parseNumber(' 3,277,96 € ')).toBe(3277.96);
    });
    
    it('should handle falsy values safely', () => {
      expect(parseNumber(null)).toBe(0);
      expect(parseNumber(undefined)).toBe(0);
      expect(parseNumber('')).toBe(0);
    });
  });

  describe('parseDate', () => {
    it('should convert DD/MM/YYYY to YYYY-MM-DD', () => {
      expect(parseDate('25/06/2026')).toBe('2026-06-25');
      expect(parseDate('5/6/2026')).toBe('2026-06-05');
    });

    it('should leave ISO dates unchanged', () => {
      expect(parseDate('2026-06-25')).toBe('2026-06-25');
    });
  });

  describe('parseLegacyTransactionType', () => {
    it('should parse known income keywords as Income', () => {
      expect(parseLegacyTransactionType('income')).toBe('Income');
      expect(parseLegacyTransactionType('Credit')).toBe('Income');
      expect(parseLegacyTransactionType('entrada')).toBe('Income');
      expect(parseLegacyTransactionType(' crÉdito ')).toBe('Income');
    });

    it('should default to Expense for unknown types', () => {
      expect(parseLegacyTransactionType('Expense')).toBe('Expense');
      expect(parseLegacyTransactionType('saída')).toBe('Expense');
      expect(parseLegacyTransactionType('')).toBe('Expense');
      expect(parseLegacyTransactionType(null)).toBe('Expense');
    });
  });
});
