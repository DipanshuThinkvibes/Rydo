import { LICENSE_ALLOWS, MIN_DRIVER_AGE, ageOn, type LicenseClass } from '@rydo/shared';

export interface Check {
  code: string;
  /** VEHICLE checks decide the vehicle's status; DRIVER checks must pass too before the application goes to HR. */
  group: 'VEHICLE' | 'DRIVER';
  label: string;
  passed: boolean;
  /** What was found, or what to do to fix it. */
  detail: string;
}

interface Doc {
  number: string | null;
  expiresAt: Date | null;
}

export interface CheckInput {
  vehicle: { type: 'CAR' | 'BIKE'; plateNumber: string; seatCapacity: number; manufactureYear: number | null };
  rc?: Doc;
  insurance?: Doc;
  license?: Doc;
  /** Is the back of the licence uploaded? */
  licenseBack?: boolean;
  /** The three vehicle photos: front (plate readable), side (whole vehicle), inside (seats visible). */
  photos?: { front: boolean; side: boolean; inside: boolean };
  /** Has the driver added a profile photo, and agreed to the safety guidelines? */
  profilePhoto?: boolean;
  guidelines?: boolean;
  driver: { dateOfBirth: Date | null; licenseClass: string | null; drivingSince: number | null };
  now?: Date;
}

export interface CheckOutcome {
  /** All checks passed: the vehicle is verified and the driver can be sent to HR. */
  passed: boolean;
  vehiclePassed: boolean;
  checks: Check[];
}

const plain = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');
/** State series like KA01AB1234 and the national BH series like 22BH1234AA. */
const STANDARD_PLATE = /^[A-Z]{2}\d{2}[A-Z]{1,3}\d{4}$/;
const BH_PLATE = /^\d{2}BH\d{4}[A-Z]{1,2}$/;

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const date = (d: Date) => d.toISOString().slice(0, 10);

/**
 * The vehicle check: plain rules, no guessing, each with a clear reason.
 * It looks at the vehicle and its registration (RC) and insurance, then at the driver's licence and age.
 * Nothing here calls an outside service; it checks that the papers are present, match and are in date.
 */
export function runVehicleCheck(input: CheckInput): CheckOutcome {
  const today = startOfDay(input.now ?? new Date());
  const { vehicle, rc, insurance, license, driver } = input;
  const checks: Check[] = [];
  const add = (c: Check) => checks.push(c);
  const inDate = (d?: Doc) => !!d?.expiresAt && startOfDay(d.expiresAt) >= today;

  const plate = plain(vehicle.plateNumber);
  add({
    code: 'PLATE_FORMAT', group: 'VEHICLE', label: 'Number plate looks right',
    passed: STANDARD_PLATE.test(plate) || BH_PLATE.test(plate),
    detail: STANDARD_PLATE.test(plate) || BH_PLATE.test(plate) ? vehicle.plateNumber : 'Use a plate like KA 01 AB 1234 or 22 BH 1234 AA.',
  });
  add({
    code: 'SEATS', group: 'VEHICLE', label: 'Passenger seats are possible',
    passed: vehicle.type === 'BIKE' ? vehicle.seatCapacity === 1 : vehicle.seatCapacity >= 1 && vehicle.seatCapacity <= 6,
    detail: vehicle.type === 'BIKE' ? 'A bike carries one passenger.' : `${vehicle.seatCapacity} passenger seat(s).`,
  });

  add({ code: 'RC_PRESENT', group: 'VEHICLE', label: 'Registration certificate (RC) uploaded', passed: !!rc, detail: rc ? 'Uploaded.' : 'Upload the RC for this vehicle.' });
  add({
    code: 'RC_MATCH', group: 'VEHICLE', label: 'RC number matches the number plate',
    passed: !!rc?.number && plain(rc.number).includes(plate),
    detail: !rc?.number ? 'Upload the RC first.' : plain(rc.number).includes(plate) ? 'Matches.' : `The RC says ${rc.number}, but the plate is ${vehicle.plateNumber}. Check both.`,
  });
  add({
    code: 'RC_VALID', group: 'VEHICLE', label: 'RC is in date', passed: inDate(rc),
    detail: !rc ? 'Upload the RC first.' : rc.expiresAt ? (inDate(rc) ? `Valid till ${date(rc.expiresAt)}.` : `Expired on ${date(rc.expiresAt)}. Upload the renewed RC.`) : 'The RC has no end date. Enter it.',
  });
  add({ code: 'INSURANCE_PRESENT', group: 'VEHICLE', label: 'Insurance uploaded', passed: !!insurance, detail: insurance ? 'Uploaded.' : 'Upload the insurance policy for this vehicle.' });
  add({
    code: 'INSURANCE_VALID', group: 'VEHICLE', label: 'Insurance is in date', passed: inDate(insurance),
    detail: !insurance ? 'Upload the insurance first.' : insurance.expiresAt ? (inDate(insurance) ? `Valid till ${date(insurance.expiresAt)}.` : `Expired on ${date(insurance.expiresAt)}. Upload the renewed policy.`) : 'The policy has no end date. Enter it.',
  });
  const photos = input.photos ?? { front: false, side: false, inside: false };
  const missing = [!photos.front && 'front', !photos.side && 'side', !photos.inside && 'inside'].filter(Boolean) as string[];
  add({
    code: 'VEHICLE_PHOTOS', group: 'VEHICLE', label: 'Three vehicle photos uploaded', passed: missing.length === 0,
    detail: missing.length === 0 ? 'Front, side and inside.' : `Add the ${missing.join(', ')} photo${missing.length > 1 ? 's' : ''} so HR can check the vehicle without a visit.`,
  });
  if (vehicle.manufactureYear !== null) {
    const ok = vehicle.manufactureYear >= 1990 && vehicle.manufactureYear <= today.getFullYear() + 1;
    add({ code: 'YEAR', group: 'VEHICLE', label: 'Year of make is possible', passed: ok, detail: ok ? String(vehicle.manufactureYear) : 'Enter the year the vehicle was made.' });
  }

  const allowed = LICENSE_ALLOWS[vehicle.type] as readonly string[];
  add({ code: 'LICENSE_PRESENT', group: 'DRIVER', label: 'Driving licence uploaded', passed: !!license, detail: license ? 'Uploaded.' : 'Upload your driving licence.' });
  add({
    code: 'LICENSE_VALID', group: 'DRIVER', label: 'Driving licence is in date', passed: inDate(license),
    detail: !license ? 'Upload your licence first.' : license.expiresAt ? (inDate(license) ? `Valid till ${date(license.expiresAt)}.` : `Expired on ${date(license.expiresAt)}. Upload the renewed licence.`) : 'The licence has no end date. Enter it.',
  });
  add({ code: 'LICENSE_BACK', group: 'DRIVER', label: 'Both sides of the licence uploaded', passed: !!license && !!input.licenseBack, detail: !license ? 'Upload your licence first.' : input.licenseBack ? 'Front and back.' : 'Add the back side of your licence.' });
  add({
    code: 'LICENSE_CLASS', group: 'DRIVER', label: `Licence class allows a ${vehicle.type === 'CAR' ? 'car' : 'bike'}`,
    passed: !!driver.licenseClass && allowed.includes(driver.licenseClass as LicenseClass),
    detail: !driver.licenseClass ? 'Choose your licence class.' : allowed.includes(driver.licenseClass) ? 'Allowed.' : `A ${vehicle.type === 'CAR' ? 'car' : 'bike'} needs ${vehicle.type === 'CAR' ? 'an LMV licence' : 'a motorcycle licence'}.`,
  });
  const age = driver.dateOfBirth ? ageOn(driver.dateOfBirth, today) : null;
  add({
    code: 'AGE', group: 'DRIVER', label: `Aged ${MIN_DRIVER_AGE} or over`, passed: age !== null && age >= MIN_DRIVER_AGE,
    detail: age === null ? 'Enter your date of birth.' : age >= MIN_DRIVER_AGE ? 'Old enough.' : `You must be at least ${MIN_DRIVER_AGE}.`,
  });
  if (driver.dateOfBirth && driver.drivingSince !== null) {
    const ok = driver.drivingSince >= driver.dateOfBirth.getFullYear() + MIN_DRIVER_AGE && driver.drivingSince <= today.getFullYear();
    add({ code: 'EXPERIENCE', group: 'DRIVER', label: 'Driving-since year makes sense', passed: ok, detail: ok ? `Driving since ${driver.drivingSince}.` : `That year is before you turned ${MIN_DRIVER_AGE}, or in the future.` });
  }

  add({ code: 'PROFILE_PHOTO', group: 'DRIVER', label: 'Profile photo added', passed: !!input.profilePhoto, detail: input.profilePhoto ? 'Riders will see it.' : 'Add a photo so riders know who is picking them up.' });
  add({ code: 'GUIDELINES', group: 'DRIVER', label: 'Safety guidelines agreed', passed: !!input.guidelines, detail: input.guidelines ? 'Agreed.' : 'Read the safety guidelines and agree.' });

  const vehiclePassed = checks.filter((c) => c.group === 'VEHICLE').every((c) => c.passed);
  return { passed: checks.every((c) => c.passed), vehiclePassed, checks };
}
