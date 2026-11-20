/** Field checks for the sign-up form. They only help people fix typos; the server must check everything again. */

// Verhoeff tables: the checksum Aadhaar numbers use, so a mistyped digit is caught on the spot.
const D = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
  [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
  [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
  [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
];
const P = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
  [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
  [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
  [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
];

export const digitsOnly = (s: string) => s.replace(/\D/g, "");

/** 12 digits, not starting with 0 or 1, and a valid Verhoeff check digit. */
export function isValidAadhaar(input: string) {
  const d = digitsOnly(input);
  if (!/^[2-9]\d{11}$/.test(d)) return false;
  let c = 0;
  [...d].reverse().forEach((ch, i) => {
    c = D[c][P[i % 8][Number(ch)]];
  });
  return c === 0;
}

/** "123456789012" -> "1234 5678 9012" while typing. */
export const formatAadhaar = (s: string) => digitsOnly(s).slice(0, 12).replace(/(\d{4})(?=\d)/g, "$1 ");

/** Indian mobile: 10 digits starting 6-9 (a +91 or 0 in front is ignored). */
export function isValidIndianMobile(input: string) {
  const d = digitsOnly(input).replace(/^(91|0)(?=\d{10}$)/, "");
  return /^[6-9]\d{9}$/.test(d);
}

export const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s.trim());

export const emailDomain = (s: string) => s.trim().toLowerCase().split("@")[1] ?? "";

/** Employee ids vary by company: letters, numbers and - / _ . up to 20 characters. */
export const isValidEmployeeId = (s: string) => /^[A-Za-z0-9][A-Za-z0-9\-_/.]{1,19}$/.test(s.trim());

export const isPersonName = (s: string) => /^[\p{L}][\p{L} .'-]{1,79}$/u.test(s.trim());

export type IdType = "AADHAAR" | "PAN" | "PASSPORT" | "DRIVING_LICENCE" | "VOTER_ID";

export interface IdProofRule {
  label: string;
  placeholder: string;
  hint: string;
  maxLength: number;
  /** Keep only the characters this ID can contain, in capitals, while typing. */
  clean: (s: string) => string;
  /** Returns an error message, or "" when the number looks right. */
  check: (s: string) => string;
}

const alnum = (s: string) => s.replace(/[^A-Za-z0-9]/g, "").toUpperCase();

export const ID_PROOFS: Record<IdType, IdProofRule> = {
  AADHAAR: {
    label: "Aadhaar card", placeholder: "1234 5678 9012", hint: "12 digits", maxLength: 12,
    clean: (s) => digitsOnly(s).slice(0, 12),
    check: (s) => (isValidAadhaar(s) ? "" : digitsOnly(s).length === 12 ? "This Aadhaar number is not valid. Check each digit." : "Enter the 12-digit Aadhaar number"),
  },
  PAN: {
    label: "PAN card", placeholder: "ABCDE1234F", hint: "10 characters: 5 letters, 4 digits, 1 letter", maxLength: 10,
    clean: (s) => alnum(s).slice(0, 10),
    check: (s) => (/^[A-Z]{5}\d{4}[A-Z]$/.test(s) ? "" : "Enter a valid PAN, like ABCDE1234F"),
  },
  PASSPORT: {
    label: "Passport", placeholder: "A1234567", hint: "1 letter followed by 7 digits", maxLength: 8,
    clean: (s) => alnum(s).slice(0, 8),
    check: (s) => (/^[A-Z]\d{7}$/.test(s) ? "" : "Enter a valid passport number, like A1234567"),
  },
  DRIVING_LICENCE: {
    label: "Driving licence", placeholder: "KA0120190001234", hint: "State code, RTO code, year and number (13 to 16 characters)", maxLength: 16,
    clean: (s) => alnum(s).slice(0, 16),
    check: (s) => (/^[A-Z]{2}\d{2}\d{4}\d{7}$/.test(s) || /^[A-Z]{2}\d{13}$/.test(s) ? "" : "Enter a valid licence number, like KA0120190001234"),
  },
  VOTER_ID: {
    label: "Voter ID (EPIC)", placeholder: "ABC1234567", hint: "3 letters followed by 7 digits", maxLength: 10,
    clean: (s) => alnum(s).slice(0, 10),
    check: (s) => (/^[A-Z]{3}\d{7}$/.test(s) ? "" : "Enter a valid voter ID, like ABC1234567"),
  },
};

export const ID_TYPES = Object.keys(ID_PROOFS) as IdType[];
