import { api } from "./api";
import type { IdType } from "./validators";

/**
 * Everything the sign-up screens need from the server, in one place.
 *
 * TEMPORARY: `searchCompanies` still reads a small built-in list of the companies that exist in the demo database.
 * Replace it with a real company-search endpoint and the screens will not need to change.
 * Everything else is real: the email code, and `submitRegistration`, which saves the details and asks the
 * company's HR to approve (the full ID number never leaves the browser; only its last 4 characters are sent).
 */

export interface CompanyInfo {
  id: string;
  name: string;
  /** Work email domains employees must use. */
  domains: string[];
  departments: string[];
  offices: string[];
}

export interface EmployeeDetails {
  fullName: string;
  workEmail: string;
  phone: string;
  idType: IdType;
  /** The full number; only its last 4 characters are ever sent. */
  idNumber: string;
  employeeId: string;
  managerName: string;
  managerEmail: string;
  department: string;
  designation: string;
  office: string;
}

const REGISTERED: CompanyInfo[] = [
  { id: "acme", name: "Acme Tech", domains: ["acme.test"], departments: ["Engineering", "Human Resources", "Operations", "Sales", "Finance"], offices: ["Cubbon Park HQ", "Whitefield campus"] },
  { id: "thinkvibes", name: "Thinkvibes", domains: ["thinkvibes.com"], departments: ["Engineering", "Design", "Delivery", "Sales", "Human Resources"], offices: ["Head office"] },
];

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Companies on RYDO whose name contains the text (case does not matter). */
export async function searchCompanies(query: string): Promise<CompanyInfo[]> {
  await wait(250);
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  return REGISTERED.filter((c) => c.name.toLowerCase().includes(q));
}

/** Real: saves the details and sends the approval request to the company's HR. Call after the email is verified. */
export async function submitRegistration(d: EmployeeDetails): Promise<{ status: string; company: string; notifiedAdmins: number }> {
  return api("POST", "/me/registration", {
    fullName: d.fullName,
    phone: d.phone,
    idType: d.idType,   
    idLast4: d.idNumber.slice(-4),
    employeeId: d.employeeId,
    designation: d.designation,
    department: d.department,
    office: d.office,
    managerName: d.managerName,
    managerEmail: d.managerEmail,
  });
}

/** Real: emails a 6-digit code. Creates the pending account the first time. */
export const requestEmailCode = (email: string) => api("POST", "/auth/otp/request", { email });

/** Real: checks the code and signs the person in. */
export const verifyEmailCode = (email: string, code: string) => api("POST", "/auth/otp/verify", { email, code, client: "WEB" });
