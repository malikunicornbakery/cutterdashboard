export type VerificationStatus =
  | 'verified'
  | 'partially_verified'
  | 'claimed_only'
  | 'unavailable'
  | 'unverified';

export type DiscrepancyStatus =
  | 'match'
  | 'minor_difference'
  | 'suspicious_difference'
  | 'critical_difference'
  | 'cannot_verify';

/**
 * Determine verification status based on platform and scrape result.
 *
 * YouTube uses the official Data API v3 → fully verified.
 * All other platforms use HTML scraping → partially verified at best.
 */
export function getVerificationStatus(
  platform: string,
  scrapeSuccess: boolean,
  hasClaim: boolean
): VerificationStatus {
  if (scrapeSuccess) {
    return platform === 'youtube' ? 'verified' : 'partially_verified';
  }
  return hasClaim ? 'claimed_only' : 'unavailable';
}

/**
 * Calculate discrepancy between claimed and verified view counts.
 * Returns null if no claim exists or views cannot be verified.
 */
export function calculateDiscrepancy(
  verifiedViews: number | null,
  claimedViews: number | null,
  verificationStatus: VerificationStatus
): { status: DiscrepancyStatus; percent: number | null } {
  // Can't verify → cannot compare
  if (
    verificationStatus === 'claimed_only' ||
    verificationStatus === 'unavailable' ||
    verificationStatus === 'unverified'
  ) {
    return { status: 'cannot_verify', percent: null };
  }

  // No claim to compare against
  if (claimedViews === null || claimedViews === undefined) {
    return { status: 'cannot_verify', percent: null };
  }

  if (verifiedViews === null || verifiedViews === 0) {
    return { status: 'cannot_verify', percent: null };
  }

  const percent = Math.abs(claimedViews - verifiedViews) / verifiedViews * 100;

  let status: DiscrepancyStatus;
  if (percent < 5) {
    status = 'match';
  } else if (percent < 20) {
    status = 'minor_difference';
  } else if (percent < 50) {
    status = 'suspicious_difference';
  } else {
    status = 'critical_difference';
  }

  return { status, percent: Math.round(percent * 10) / 10 };
}

/**
 * Determine if an alert should be generated based on discrepancy.
 */
export function shouldGenerateAlert(
  discrepancyStatus: DiscrepancyStatus
): { generate: boolean; severity: 'medium' | 'high' | null } {
  if (discrepancyStatus === 'suspicious_difference') {
    return { generate: true, severity: 'medium' };
  }
  if (discrepancyStatus === 'critical_difference') {
    return { generate: true, severity: 'high' };
  }
  return { generate: false, severity: null };
}
