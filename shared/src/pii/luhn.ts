/**
 * Luhn Algorithm (Mod 10) Implementation for payment card validation.
 */

export function validateLuhn(cardNumber: string): boolean {
  const clean = cardNumber.replace(/[\s-]/g, '');
  if (!/^\d{2,19}$/.test(clean)) return false;

  let sum = 0;
  let shouldDouble = false;

  for (let i = clean.length - 1; i >= 0; i--) {
    let digit = parseInt(clean.charAt(i), 10);

    if (shouldDouble) {
      digit *= 2;
      if (digit > 9) {
        digit -= 9;
      }
    }

    sum += digit;
    shouldDouble = !shouldDouble;
  }

  return sum % 10 === 0;
}
