import { PiiType, PiiDetectionResult } from '../types.js';
import { validateVerhoeff } from './verhoeff.js';
import { validateLuhn } from './luhn.js';

// Deterministic Regex Patterns
const REGEX_PATTERNS: Record<string, RegExp> = {
  EMAIL: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
  PAN: /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/,
  PHONE_IN: /^(?:(?:\+|0{0,2})91[\s-]?)?[6-9]\d{9}$/,
  PHONE_GENERIC: /^\+?[1-9]\d{1,14}$/,
  AADHAAR_RAW: /^\d{12}$/,
  AADHAAR_FORMATTED: /^\d{4}[\s-]\d{4}[\s-]\d{4}$/,
  UPI_ID: /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$/,
  BANK_ACCOUNT: /^\d{9,18}$/,
};

/**
 * Masks a sensitive value for safe preview in metadata reports (e.g. "9876543210" -> "98******10").
 */
export function maskSensitiveValue(val: string, piiType: PiiType): string {
  if (!val) return '';
  const clean = val.trim();
  const len = clean.length;

  if (piiType === 'EMAIL') {
    const parts = clean.split('@');
    if (parts.length === 2) {
      const user = parts[0];
      const domain = parts[1];
      const maskedUser = user.length > 2 ? `${user[0]}***${user[user.length - 1]}` : `${user[0]}*`;
      return `${maskedUser}@${domain}`;
    }
  }

  if (len <= 4) {
    return '*'.repeat(len);
  }

  const prefixLen = Math.min(2, Math.floor(len / 4));
  const suffixLen = Math.min(2, Math.floor(len / 4));
  const maskedLen = len - prefixLen - suffixLen;

  return `${clean.slice(0, prefixLen)}${'*'.repeat(maskedLen)}${clean.slice(len - suffixLen)}`;
}

/**
 * Tests a single string value against PII classifiers.
 */
export function classifySingleValue(value: unknown): PiiType {
  if (value === null || value === undefined) return 'UNKNOWN';
  const str = String(value).trim();
  if (!str) return 'UNKNOWN';

  // 1. Email Check
  if (REGEX_PATTERNS.EMAIL.test(str)) {
    return 'EMAIL';
  }

  // 2. PAN Check (5 alpha, 4 digit, 1 alpha)
  const upperStr = str.toUpperCase();
  if (REGEX_PATTERNS.PAN.test(upperStr)) {
    return 'PAN';
  }

  // 3. Aadhaar Check (12 digits + Verhoeff validation)
  const cleanAadhaar = str.replace(/[\s-]/g, '');
  if (REGEX_PATTERNS.AADHAAR_RAW.test(cleanAadhaar)) {
    if (validateVerhoeff(cleanAadhaar)) {
      return 'AADHAAR';
    }
  }

  // 4. Payment Card Check (13-19 digits + Luhn validation)
  const cleanCard = str.replace(/[\s-]/g, '');
  if (/^\d{13,19}$/.test(cleanCard)) {
    if (validateLuhn(cleanCard)) {
      return 'CREDIT_CARD';
    }
  }

  // 5. Phone Check
  const cleanPhone = str.replace(/[\s-]/g, '');
  if (REGEX_PATTERNS.PHONE_IN.test(cleanPhone)) {
    return 'PHONE';
  }

  // 6. UPI / VPA Check
  if (REGEX_PATTERNS.UPI_ID.test(str) && !str.includes('gmail.com') && !str.includes('yahoo.com') && !str.includes('outlook.com')) {
    // Check common UPI handles
    const upiHandles = ['okhdfcbank', 'okaxis', 'okicici', 'oksbi', 'paytm', 'ybl', 'ibl', 'axl', 'apl', 'upi'];
    const domain = str.split('@')[1]?.toLowerCase();
    if (upiHandles.includes(domain) || !domain.includes('.')) {
      return 'UPI_ID';
    }
  }

  return 'UNKNOWN';
}

/**
 * Analyzes a column name (schema heuristic) to infer or reinforce PII classification.
 */
export function classifyByColumnName(columnName: string): PiiType | null {
  const norm = columnName.toLowerCase().replace(/[_\s-]/g, '');

  if (norm.includes('aadhaar') || norm.includes('uidai') || norm.includes('nationalid')) return 'AADHAAR';
  if (norm.includes('pancard') || norm.includes('pannumber') || norm === 'pan') return 'PAN';
  if (norm.includes('email') || norm.includes('mailaddress')) return 'EMAIL';
  if (norm.includes('phone') || norm.includes('mobile') || norm.includes('contactno') || norm.includes('cellphone')) return 'PHONE';
  if (norm.includes('cardnumber') || norm.includes('creditcard') || norm.includes('debitcard') || norm.includes('cvv') || norm.includes('pan_card')) return 'CREDIT_CARD';
  if (norm.includes('upi') || norm.includes('vpa')) return 'UPI_ID';
  if (norm.includes('fullname') || norm.includes('firstname') || norm.includes('lastname') || norm.includes('username') || norm === 'name') return 'NAME';
  if (norm.includes('address') || norm.includes('street') || norm.includes('city') || norm.includes('pincode') || norm.includes('zipcode')) return 'ADDRESS';
  if (norm.includes('accountnumber') || norm.includes('bankacc') || norm.includes('ifsc')) return 'BANK_ACCOUNT';

  return null;
}

/**
 * Classifies an entire sample array of column values + column name.
 * Combines statistical value sampling with schema column heuristics.
 */
export function classifyColumnSample(columnName: string, samples: unknown[]): PiiDetectionResult {
  const total = samples.length;
  if (total === 0) {
    const nameMatch = classifyByColumnName(columnName);
    return {
      piiType: nameMatch || 'UNKNOWN',
      confidence: nameMatch ? 0.6 : 0.0,
      sampleCount: 0,
      matchCount: 0,
      reason: nameMatch ? `Inferred from column name '${columnName}'` : 'Empty sample',
    };
  }

  const counts: Record<PiiType, number> = {
    AADHAAR: 0,
    PAN: 0,
    PHONE: 0,
    EMAIL: 0,
    CREDIT_CARD: 0,
    UPI_ID: 0,
    NAME: 0,
    ADDRESS: 0,
    BANK_ACCOUNT: 0,
    UNKNOWN: 0,
  };

  let firstMatchVal: string | undefined;
  let firstMatchType: PiiType = 'UNKNOWN';

  for (const s of samples) {
    const type = classifySingleValue(s);
    counts[type]++;
    if (type !== 'UNKNOWN' && !firstMatchVal) {
      firstMatchVal = String(s);
      firstMatchType = type;
    }
  }

  // Find dominant matched type
  let dominantType: PiiType = 'UNKNOWN';
  let maxCount = 0;

  for (const [type, count] of Object.entries(counts) as [PiiType, number][]) {
    if (type !== 'UNKNOWN' && count > maxCount) {
      maxCount = count;
      dominantType = type;
    }
  }

  const nameInference = classifyByColumnName(columnName);

  if (dominantType !== 'UNKNOWN') {
    const matchRatio = maxCount / total;
    let confidence = matchRatio * 0.9;
    if (nameInference === dominantType) {
      confidence = Math.min(1.0, confidence + 0.15); // Boost confidence if name matches value type
    }
    return {
      piiType: dominantType,
      confidence: Math.round(confidence * 100) / 100,
      sampleCount: total,
      matchCount: maxCount,
      sampleMasked: firstMatchVal ? maskSensitiveValue(firstMatchVal, firstMatchType) : undefined,
      reason: `Matched ${maxCount}/${total} samples (${Math.round(matchRatio * 100)}%) as ${dominantType}`,
    };
  }

  // Fallback to column name inference if values were ambiguous
  if (nameInference) {
    return {
      piiType: nameInference,
      confidence: 0.65,
      sampleCount: total,
      matchCount: 0,
      sampleMasked: samples[0] ? maskSensitiveValue(String(samples[0]), nameInference) : undefined,
      reason: `Inferred from column name '${columnName}'`,
    };
  }

  return {
    piiType: 'UNKNOWN',
    confidence: 0.0,
    sampleCount: total,
    matchCount: 0,
    reason: 'No PII patterns matched',
  };
}
