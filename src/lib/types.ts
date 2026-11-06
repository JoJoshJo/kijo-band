// Shared contract for all Kijo sessions (spec section 3).
// Timestamps are Unix epoch milliseconds. Change this file only by agreement.

export type Wing = "North" | "South" | "Guest";
export type Language = "en" | "fr" | "es";
export type ResidentStatus = "ok" | "attention" | "emergency";
export type CodeStatus = "Full code" | "DNR";
export type FallRisk = "Low" | "Medium" | "High";
export type Mobility = "Independent" | "Walker" | "Wheelchair" | "Bed-bound";
export type Cognition = "Oriented" | "Mild confusion" | "Dementia";

export interface EmergencyContact {
  name: string;
  relation: string;
  phone: string;
}

export interface Resident {
  id: string;
  name: string; // "Mr. Davis"
  room: string; // "14"
  wing: Wing;
  language: Language;
  canSpeak: boolean; // false → voice disabled, buttons/gesture emphasized
  assignedNurseId: string;
  age: number;
  codeStatus: CodeStatus;
  fallRisk: FallRisk;
  mobility: Mobility;
  cognition: Cognition;
  allergies: string[];
  careNotes: string;
  emergencyContact: EmergencyContact;
  status: ResidentStatus;
  heartRate: number; // live (simulated or measured)
  lastMotionAt: number;
  isGuest?: boolean;
  createdAt: number;
}

export type NurseRole = "CNA" | "RN" | "Charge";
export type NurseStatus = "available" | "responding";

export interface Nurse {
  id: string;
  name: string; // "Nurse Ana"
  role: NurseRole;
  wing: string;
  status: NurseStatus;
}

export type AlertType =
  | "fall"
  | "voice"
  | "sos_shake"
  | "need_pain"
  | "need_bathroom"
  | "need_water"
  | "need_help"
  | "vitals";

/** 1 = critical (red, 0.5s flash), 2 = urgent (yellow, 2s flash), 3 = routine (light blue, steady) */
export type AlertPriority = 1 | 2 | 3;
export type AlertStatus = "open" | "acknowledged" | "resolved";

export interface Alert {
  id: string;
  residentId: string;
  type: AlertType;
  priority: AlertPriority;
  summary: string; // AI or rule-generated one-liner for nurses
  transcript?: string; // voice only — the short sentence, never audio
  heartRate?: number;
  assignedNurseId: string;
  escalatedTo?: string; // charge nurse id after timeout
  assistingNurseIds?: string[];
  status: AlertStatus;
  createdAt: number;
  acknowledgedAt?: number;
  resolvedAt?: number;
  patientMessage: string; // shown on the band, in resident's language
  // NOTE: the per-alert ack token is server-only and never part of this type.
}

/** Response shape of GET /api/state */
export interface StateResponse {
  residents: Resident[];
  nurses: Nurse[];
  alerts: Alert[]; // open + acknowledged (not resolved)
  serverTime: number;
}
