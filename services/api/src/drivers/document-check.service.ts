import { Inject, Injectable } from '@nestjs/common';
import type { DocumentCheckStatus } from '@prisma/client';
import { LICENSE_CLASS_LABEL, type LicenseClass } from '@rydo/shared';
import { PrismaService } from '../prisma/prisma.service';
import { DOCUMENT_CHECK, DocumentCheckAdapter, type CheckOutcome } from '../adapters/document-check.adapter';

/** Longest we wait for the provider while the driver waits on the upload screen. */
const CHECK_TIMEOUT_MS = 12_000;

/** "✓ …" passed, "! …" worth a look, "✗ …" failed. The first character is read by the checklist and the app. */
type Note = { level: 'ok' | 'warn' | 'fail'; text: string };
const mark = { ok: '✓', warn: '!', fail: '✗' } as const;

const words = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^a-z\s]/g, ' ').split(/\s+/).filter((w) => w.length > 1);
/** Same person if every word of the shorter name appears in the longer one ("Rahul M" vs "RAHUL MEHTA" counts as initials). */
export function sameName(a: string, b: string) {
  const [x, y] = [words(a), words(b)].sort((p, q) => p.length - q.length);
  if (!x.length) return false;
  return x.every((w) => y.some((v) => v === w || (w.length === 1 && v.startsWith(w))));
}
const today = () => new Date().toISOString().slice(0, 10);
/** Class codes as the RTO prints them that let someone drive each vehicle type on RYDO. */
const RECORD_CLASSES_FOR: Record<'CAR' | 'BIKE', string[]> = { CAR: ['LMV'], BIKE: ['MCWG', 'MCWOG'] };
/** The codes inside the class the driver picked (LMV_MCWG covers both LMV and MCWG). */
const codesOf = (c: string) => c.split('_');

/**
 * Checks licence, RC and insurance numbers against government records through the DOCUMENT_CHECK adapter and stores
 * the result on the document. HR sees the notes; a FAILED check needs an explicit "verify anyway".
 */
@Injectable()
export class DocumentCheckService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(DOCUMENT_CHECK) private readonly checks: DocumentCheckAdapter,
  ) {}

  private async withTimeout<T>(p: Promise<CheckOutcome<T>>): Promise<CheckOutcome<T>> {
    try {
      return await Promise.race([p, new Promise<CheckOutcome<T>>((resolve) => setTimeout(() => resolve({ kind: 'unavailable', reason: 'The government records check took too long.' }), CHECK_TIMEOUT_MS))]);
    } catch {
      return { kind: 'unavailable', reason: 'The government records check is not answering right now.' };
    }
  }

  /** Runs the right check for a licence, RC or insurance document and saves the result. Photos are skipped. */
  async checkAndStore(documentId: string) {
    const doc = await this.prisma.document.findUniqueOrThrow({
      where: { id: documentId },
      include: { vehicle: true, driver: { include: { vehicles: { where: { active: true } }, membership: { include: { user: { select: { name: true } } } } } } },
    });
    if (!['DRIVING_LICENSE', 'VEHICLE_RC', 'INSURANCE'].includes(doc.kind)) return null;
    const name = doc.driver.membership.user.name;
    const notes: Note[] = [];
    let unavailable: string | null = null;

    if (doc.kind === 'DRIVING_LICENSE') {
      const r = await this.withTimeout(this.checks.checkLicence({ number: doc.number ?? '', dateOfBirth: doc.driver.dateOfBirth?.toISOString().slice(0, 10) ?? '' }));
      if (r.kind === 'unavailable') unavailable = r.reason;
      else if (r.kind === 'notFound') notes.push({ level: 'fail', text: 'No licence with this number and date of birth in government records (Sarathi).' });
      else {
        const rec = r.record;
        notes.push({ level: 'ok', text: 'Licence found in government records (Sarathi).' });
        if (rec.name) notes.push(sameName(rec.name, name) ? { level: 'ok', text: `Name matches (${rec.name}).` } : { level: 'warn', text: `Name on the licence is ${rec.name}, not ${name}.` });
        if (rec.validTill) {
          if (rec.validTill < today()) notes.push({ level: 'fail', text: `Licence expired on ${rec.validTill}.` });
          else notes.push({ level: 'ok', text: `Valid till ${rec.validTill}.` });
          const typed = doc.expiresAt?.toISOString().slice(0, 10);
          if (typed && typed !== rec.validTill) notes.push({ level: 'warn', text: `Valid-till date typed (${typed}) differs from the record (${rec.validTill}).` });
        }
        const has = rec.vehicleClasses.map((c) => c.toUpperCase());
        if (has.length) {
          for (const type of [...new Set(doc.driver.vehicles.map((v) => v.type))]) {
            const needed = RECORD_CLASSES_FOR[type];
            if (!needed.some((c) => has.some((h) => h.includes(c)))) notes.push({ level: 'fail', text: `The licence does not cover ${type === 'CAR' ? 'cars' : 'bikes'} (${needed.join(' or ')}).` });
          }
          const picked = doc.driver.licenseClass;
          if (picked && !codesOf(picked).every((c) => has.some((h) => h.includes(c)))) notes.push({ level: 'warn', text: `Driver picked ${LICENSE_CLASS_LABEL[picked as LicenseClass] ?? picked}, which the record does not list.` });
        }
      }
    } else {
      const vehicle = doc.vehicle;
      if (!vehicle) return null;
      const r = await this.withTimeout(this.checks.checkVehicle({ plateNumber: vehicle.plateNumber }));
      if (r.kind === 'unavailable') unavailable = r.reason;
      else if (r.kind === 'notFound') notes.push({ level: 'fail', text: `No vehicle ${vehicle.plateNumber} in government records (Vahan).` });
      else {
        const rec = r.record;
        const typed = doc.expiresAt?.toISOString().slice(0, 10);
        if (doc.kind === 'VEHICLE_RC') {
          notes.push({ level: 'ok', text: `Vehicle ${vehicle.plateNumber} found in government records (Vahan)${rec.makerModel ? `: ${rec.makerModel}` : ''}.` });
          if (rec.ownerName) notes.push(sameName(rec.ownerName, name) ? { level: 'ok', text: `Registered to the driver (${rec.ownerName}).` } : { level: 'warn', text: `Registered to ${rec.ownerName}, not ${name}. Fine for a family car; check with the driver.` });
          if (rec.registrationValidTill) {
            if (rec.registrationValidTill < today()) notes.push({ level: 'fail', text: `Registration expired on ${rec.registrationValidTill}.` });
            else notes.push({ level: 'ok', text: `Registration valid till ${rec.registrationValidTill}.` });
            if (typed && typed !== rec.registrationValidTill) notes.push({ level: 'warn', text: `Valid-till date typed (${typed}) differs from the record (${rec.registrationValidTill}).` });
          }
        } else {
          if (!rec.insuranceValidTill) notes.push({ level: 'warn', text: 'Government records have no insurance for this vehicle. Check the policy photo.' });
          else if (rec.insuranceValidTill < today()) notes.push({ level: 'fail', text: `Insurance expired on ${rec.insuranceValidTill} according to government records.` });
          else notes.push({ level: 'ok', text: `Insured till ${rec.insuranceValidTill}${rec.insurer ? ` (${rec.insurer})` : ''}.` });
          if (rec.insuranceValidTill && typed && typed !== rec.insuranceValidTill) notes.push({ level: 'warn', text: `Valid-till date typed (${typed}) differs from the record (${rec.insuranceValidTill}).` });
          if (rec.insurancePolicyNumber && doc.number && rec.insurancePolicyNumber.replace(/\W/g, '').toUpperCase() !== doc.number.replace(/\W/g, '')) notes.push({ level: 'warn', text: `Policy number on record is ${rec.insurancePolicyNumber}.` });
        }
      }
    }

    const status: DocumentCheckStatus = unavailable ? 'UNAVAILABLE' : notes.some((n) => n.level === 'fail') ? 'FAILED' : notes.some((n) => n.level === 'warn') ? 'WARNING' : 'PASSED';
    const checkNotes = unavailable ? [`! ${unavailable} Check the photo by eye.`] : notes.map((n) => `${mark[n.level]} ${n.text}`);
    return this.prisma.document.update({ where: { id: doc.id }, data: { checkStatus: status, checkNotes, checkedAt: new Date() } });
  }
}

