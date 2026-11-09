// FR22: checks for the simulated card payment. Card details are only checked, never stored.

// Spaces are allowed while typing a card number, so they are removed before checking
export const cardDigits = (input: string) => input.replace(/ /g, "");

// FR22: exactly 16 digits
export const hasSixteenDigits = (digits: string) => /^\d{16}$/.test(digits);

// FR22: the Luhn checksum every real card number carries. From the right, every second
// digit is doubled (minus 9 if that passes 9); the total must be a multiple of 10.
export function passesLuhn(digits: string): boolean {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let digit = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  }
  return sum % 10 === 0;
}

// FR22: an expiry written as MM/YY with a real month, or null
export function parseExpiry(input: string): { month: number; year: number } | null {
  const match = /^(\d{2})\/(\d{2})$/.exec(input);
  if (!match) return null;
  const month = Number(match[1]);
  if (month < 1 || month > 12) return null;
  return { month, year: 2000 + Number(match[2]) };
}

// FR22: a card works through the end of its expiry month. "now" is a parameter so tests can fix the date.
export function isExpired(expiry: { month: number; year: number }, now: Date = new Date()): boolean {
  const thisMonth = now.getFullYear() * 12 + now.getMonth();
  const expiryMonth = expiry.year * 12 + (expiry.month - 1);
  return expiryMonth < thisMonth;
}

// FR22: a security code of exactly 3 digits
export const isSecurityCode = (input: string) => /^\d{3}$/.test(input);
