/**
 * Checks driver papers against government records: driving licences (Sarathi) and vehicles (Vahan: RC and insurance).
 * In India this goes through a paid verification provider (Surepass, Cashfree Secure ID, Signzy…). Feature code
 * depends only on this interface; the provider is chosen in adapters.module.ts from DOC_CHECK_PROVIDER.
 *
 * Adding a real provider: write a class that implements DocumentCheckAdapter (HTTP call with its API key from env),
 * map its response to the shapes below, and add it to the factory in adapters.module.ts.
 */
export interface LicenceRecord {
  /** Holder's name as the RTO has it. */
  name: string | null;
  /** Last date the licence is valid for private vehicles (YYYY-MM-DD). */
  validTill: string | null;
  /** Classes the licence covers, as the RTO lists them (e.g. "LMV", "MCWG"). */
  vehicleClasses: string[];
}

export interface VehicleRecord {
  ownerName: string | null;
  /** e.g. "HONDA CITY" */
  makerModel: string | null;
  /** RC (registration) valid till, YYYY-MM-DD. */
  registrationValidTill: string | null;
  insuranceValidTill: string | null;
  insurer: string | null;
  insurancePolicyNumber: string | null;
}

/**
 * found: the record exists; notFound: the authority has no such number; unavailable: the check could not be done
 * (provider not set up, timeout, provider down). Unavailable is never treated as a failure.
 */
export type CheckOutcome<T> = { kind: 'found'; record: T } | { kind: 'notFound' } | { kind: 'unavailable'; reason: string };

export interface DocumentCheckAdapter {
  checkLicence(input: { number: string; dateOfBirth: string }): Promise<CheckOutcome<LicenceRecord>>;
  checkVehicle(input: { plateNumber: string }): Promise<CheckOutcome<VehicleRecord>>;
}
export const DOCUMENT_CHECK = Symbol('DOCUMENT_CHECK');

/** Default until a provider is chosen: every check is "unavailable", so HR checks the photos by eye as before. */
export class OffDocumentCheck implements DocumentCheckAdapter {
  async checkLicence(): Promise<CheckOutcome<LicenceRecord>> {
    return { kind: 'unavailable', reason: 'Government record checks are not switched on yet.' };
  }
  async checkVehicle(): Promise<CheckOutcome<VehicleRecord>> {
    return { kind: 'unavailable', reason: 'Government record checks are not switched on yet.' };
  }
}

/**
 * For demos and local testing only (refused in production by the env check). No network.
 * A number containing "0000" is "not found"; anything else is found and valid. Names are not returned, so they are not compared.
 */
export class DemoDocumentCheck implements DocumentCheckAdapter {
  private inYears(n: number) {
    const d = new Date();
    d.setFullYear(d.getFullYear() + n);
    return d.toISOString().slice(0, 10);
  }
  async checkLicence({ number }: { number: string; dateOfBirth: string }): Promise<CheckOutcome<LicenceRecord>> {
    if (number.includes('0000')) return { kind: 'notFound' };
    return { kind: 'found', record: { name: null, validTill: this.inYears(5), vehicleClasses: ['LMV', 'MCWG'] } };
  }
  async checkVehicle({ plateNumber }: { plateNumber: string }): Promise<CheckOutcome<VehicleRecord>> {
    if (plateNumber.replace(/\s/g, '').includes('0000')) return { kind: 'notFound' };
    return {
      kind: 'found',
      record: { ownerName: null, makerModel: null, registrationValidTill: this.inYears(10), insuranceValidTill: this.inYears(1), insurer: 'Demo Insurance', insurancePolicyNumber: null },
    };
  }
}
