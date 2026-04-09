/**
 * Verification-specific types.
 * Full status architecture lives in @/lib/status
 */

export type VerificationSource =
  | 'official_api'
  | 'third_party_scraper'
  | 'manual_proof'
  | 'claimed_only'
  | 'unavailable';

export type VerificationStatus =
  | 'verified'
  | 'partially_verified'
  | 'manual_proof'
  | 'claimed_only'
  | 'unavailable'
  | 'unverified';

export type DiscrepancyStatus =
  | 'match'
  | 'minor_difference'
  | 'suspicious_difference'
  | 'critical_difference'
  | 'cannot_verify';

export const CONFIDENCE_SCORES: Record<VerificationSource, number> = {
  official_api:        95,
  third_party_scraper: 60,
  manual_proof:        40,
  claimed_only:        10,
  unavailable:         0,
};

export interface VideoVerification {
  verificationSource: VerificationSource;
  verificationStatus: VerificationStatus;
  discrepancyStatus: DiscrepancyStatus;
  discrepancyPercent: number | null;
  confidenceLevel: number;
  currentViews: number;
  observedViews: number | null;
  apiViews: number | null;
  claimedViews: number | null;
}

export type SnapshotType =
  | 'auto_sync'
  | 'manual_sync'
  | 'proof_upload'
  | 'api_pull'
  | 'scrape';

export type AuditAction =
  | 'video.submitted'
  | 'video.verified'
  | 'video.flagged'
  | 'video.unflagged'
  | 'video.proof_uploaded'
  | 'video.proof_approved'
  | 'video.proof_rejected'
  | 'video.reviewed'
  | 'sync.completed'
  | 'invoice.generated'
  | 'invoice.approved';
