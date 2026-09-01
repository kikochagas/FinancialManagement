export function sanitizeDocumentToShapes(rawText: string) {
  const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean);
  
  const whitelist = new Set([
    'total', 'cash', 'portfolio', 'investment', 'balance', 'date', 
    'price', 'quantity', 'market', 'value', 'fee', 'tax', 'currency', 
    'isin', 'ticker', 'account', 'statement', 'assets', 'liabilities',
    'buy', 'sell', 'dividend', 'deposit', 'withdrawal'
  ]);

  const structural = lines.map(line => {
    let masked = line;
    
    // Mask ISINs
    masked = masked.replace(/\b[A-Z]{2}[A-Z0-9]{9}[0-9]\b/g, '<ISIN>');
    
    // Mask Emails
    masked = masked.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '<EMAIL>');
    
    // Mask long identifiers (like account numbers)
    masked = masked.replace(/\b[A-Z0-9]{8,20}\b/g, '<IDENTIFIER>');
    
    // Mask decimal numbers
    masked = masked.replace(/\b\d{1,3}([.,]\d{3})*([.,]\d+)?\b/g, '<DECIMAL>');
    
    // Mask integers
    masked = masked.replace(/\b\d+\b/g, '<INTEGER>');

    // Replace non-whitelisted words
    const words = masked.split(/\s+/);
    const maskedWords = words.map(word => {
      const cleanWord = word.replace(/[^a-zA-Z]/g, '').toLowerCase();
      if (cleanWord.length > 1 && !whitelist.has(cleanWord) && !word.includes('<')) {
        return '<TEXT_VALUE>';
      }
      return word;
    });
    
    return maskedWords.join(' ');
  });

  return structural.join('\n');
}
