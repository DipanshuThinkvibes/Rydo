import type { IdProofType, LatLng, OrgRoleName } from '@rydo/shared';

/** Response shapes of the API routes the app reads (same as the web app's). */

export interface Office {
  id: string;
  name: string;
  address: string | null;
  lat: number;
  lng: number;
  isDefault: boolean;
}

export interface Booking {
  id: string;
  status: 'CONFIRMED' | 'BOARDED' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW' | 'MISSED' | string;
  seats: number;
  pickupLabel: string;
  dropLabel: string;
  pickup: LatLng | null;
  drop: LatLng | null;
  route: string | null;
  pin: string | null;
  lateCancel: boolean;
  costShareEstimate: number | null;
  ride: {
    id: string;
    departAt: string;
    status: string;
    from: string;
    to: string;
    driverName: string;
    driverMembershipId: string;
    ratedDriver: boolean;
    vehicle: { make: string; model: string; color: string; plateNumber: string };
  };
}

export interface RideReq {
  id: string;
  status: 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'EXPIRED' | 'CANCELLED';
  seats: number;
  pickupLabel: string;
  dropLabel: string;
  matchScore: number | null;
  createdAt: string;
  expiresAt: string;
  ride: { id: string; departAt: string; from: string; to: string; driverName: string; plateNumber: string };
}

export interface Vehicle {
  id: string;
  type: 'CAR' | 'BIKE';
  make: string;
  model: string;
  color: string;
  plateNumber: string;
  seatCapacity: number;
  hasAc: boolean;
  isDefault: boolean;
}
export interface DriverDoc {
  id: string;
  kind: 'DRIVING_LICENSE' | 'VEHICLE_RC';
  number: string | null;
  expiresAt: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  rejectReason: string | null;
  vehicleId: string | null;
}
export interface DriverProfile {
  id: string;
  status: 'PENDING' | 'VERIFIED' | 'REJECTED' | 'EXPIRED';
  vehicles: Vehicle[];
  documents: DriverDoc[];
}

export interface DrivingRide {
  id: string;
  direction: string;
  originLabel: string;
  destinationLabel: string;
  departAt: string;
  seatsTotal: number;
  seatsBooked: number;
  status: 'SCHEDULED' | 'FULL' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  distanceMeters: number | null;
  durationSeconds: number | null;
  pendingRequests: number;
  route: string | null;
}

export interface RidePlan {
  id: string;
  originLabel: string;
  destinationLabel: string;
  departTime: string;
  returnTime: string | null;
  daysOfWeek: number[];
  oneOffDate: string | null;
  seats: number;
  womenOnly: boolean;
  active: boolean;
  upcomingRides: number;
}

interface Person {
  name: string;
  department: string | null;
  reliability: number;
  rating: number | null;
}
export interface ManagedRide {
  id: string;
  status: DrivingRide['status'];
  departAt: string;
  from: string;
  to: string;
  seatsTotal: number;
  seatsBooked: number;
  distanceMeters: number | null;
  durationSeconds: number | null;
  route: string | null;
  vehicle: { make: string; model: string; plateNumber: string };
  riders: (Person & { bookingId: string; status: string; seats: number; pickupLabel: string; dropLabel: string; pickup: LatLng | null; drop: LatLng | null })[];
  requests: (Person & { requestId: string; seats: number; pickupLabel: string; dropLabel: string; matchScore: number | null; reasons: string[]; createdAt: string; expiresAt: string; pickup: LatLng | null; drop: LatLng | null })[];
}

export interface MyProfile {
  name: string;
  email: string;
  phone: string | null;
  gender: 'FEMALE' | 'MALE' | 'OTHER' | 'UNDISCLOSED';
  photoUrl: string | null;
  emergencyContacts: number;
  department: string | null;
  reliabilityScore: number;
  rating: { average: number | null; count: number; recentComments?: { stars: number; comment: string; createdAt: string }[] };
  ridesCompleted: { asDriver: number; asRider: number };
}

export interface ChatThread {
  riderMembershipId: string;
  as: 'DRIVER' | 'RIDER';
  with: { membershipId: string; name: string };
  unread: number;
  lastMessage: { body: string; at: string } | null;
  canSend: boolean;
  archived: boolean;
}
export interface ChatMessage {
  id: string;
  body: string;
  mine: boolean;
  createdAt: string;
  readAt: string | null;
}

export interface Member {
  id: string;
  name: string;
  email: string;
  department: string | null;
  departmentId?: string | null;
  status: 'PENDING' | 'ACTIVE' | 'REJECTED' | 'SUSPENDED' | 'LEFT';
  roles: OrgRoleName[];
  /** What the person filed at sign-up (POST /me/registration); null for people added another way. */
  registration?: {
    employeeId: string;
    designation: string;
    department: string;
    office: string;
    phone: string;
    idType: IdProofType;
    idLast4: string;
    managerName: string;
    managerEmail: string;
    submittedAt: string;
  } | null;
}
export interface AdminDriver {
  id: string;
  name: string;
  email: string;
  department: string | null;
  status: DriverProfile['status'];
  needsReview: boolean;
  vehicles: Vehicle[];
  documents: DriverDoc[];
}
export interface SosAlert {
  id: string;
  status: 'ACTIVE' | 'ACKNOWLEDGED' | 'RESOLVED';
  createdAt: string;
  rideId: string;
  raisedBy: string;
  byDriver: boolean;
  driverName: string;
  plateNumber: string;
  from: string;
  to: string;
}
export interface Issue {
  id: string;
  category: string;
  categoryLabel: string;
  description: string;
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED';
  createdAt: string;
  reporter?: { name: string };
  against?: { name: string } | null;
  assignedTo?: { name: string } | null;
}

// ── Engagement APIs (ENGAGEMENT_API.md) ──

export interface EmergencyContact {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  relation: string | null;
}
export interface Blocked {
  membershipId: string;
  name: string;
  blockedAt: string;
}
export interface MemberCard {
  membershipId: string;
  name: string;
  photoUrl: string | null;
  department: string | null;
  reliabilityScore: number;
  rating: { average: number | null; count: number; recentComments?: { stars: number; comment: string; createdAt: string }[] };
  ridesCompleted: { asDriver: number; asRider: number };
  driver: { verified: true; preferences: unknown; vehicle: { type: string; carType: string | null; make: string; model: string; color: string; hasAc: boolean } | null } | null;
}
export type SurveyQuestion =
  | { id: string; type: 'RATING'; text: string }
  | { id: string; type: 'CHOICE'; text: string; options: string[] }
  | { id: string; type: 'TEXT'; text: string };
export interface OpenSurvey {
  id: string;
  title: string;
  description: string | null;
  questions: SurveyQuestion[];
  closesAt: string | null;
  answered: boolean;
}
export interface FeedbackItem {
  id: string;
  category: string;
  rating: number | null;
  comment: string;
  status: 'NEW' | 'REVIEWED' | 'CLOSED';
  createdAt: string;
}
export interface MyIssue {
  id: string;
  categoryLabel: string;
  description: string;
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED';
  resolution: string | null;
  createdAt: string;
}

/** GET /me/email: is the work email proven with a code? */
export interface EmailState {
  email: string;
  verified: boolean;
  verifiedAt: string | null;
}
