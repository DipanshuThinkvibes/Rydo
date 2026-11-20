import { api } from "./api";
import type { IdType } from "./validators";

/**
 * Everything the sign-up screens need from the server, in one place.
 *
 * All real: `searchCompanies` reads the companies from the database, then the email code, and `submitRegistration`, which saves the details and asks the
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

/** Real: companies that are live on RYDO whose name contains the text, read from the database. */
export async function searchCompanies(query: string): Promise<CompanyInfo[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  return api<CompanyInfo[]>("GET", `/public/companies?q=${encodeURIComponent(q)}`);
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
