/**
 * STATUS ARCHITECTURE — Single source of truth
 *
 * Every status used anywhere in the product lives here.
 * Import from this file. Never hardcode status strings in components.
 *
 * Structure per status system:
 *   - Type definition
 *   - Config map (label, badge color, visibility, description)
 *   - Transition rules (what can move to what)
 *   - Business logic helpers
 */

// ─────────────────────────────────────────────────────────────────────────────
// 1. CLIP LIFECYCLE
// ─────────────────────────────────────────────────────────────────────────────

export type ClipLifecycle =
  | 'draft'         // Created but not submitted yet
  | 'submitted'     // Cutter submitted, not yet synced
  | 'syncing'       // Sync job is actively fetching
  | 'active'        // Synced, live, no issues
  | 'under_review'  // Discrepancy or flag triggered review
  | 'resolved'      // Reviewed and closed with no penalty
  | 'rejected'      // Rejected by ops (fraud, invalid, duplicate)
  | 'archived';     // Soft-deleted or past billing period

export const CLIP_LIFECYCLE_CONFIG: Record<ClipLifecycle, {
  label: string;
  labelCutter: string;     // What cutters see (simplified)
  badge: string;
  dot: string;
  visibleToCutter: boolean;
  terminal: boolean;       // Cannot transition out of this state
  description: string;
}> = {
  draft: {
    label: 'Entwurf',
    labelCutter: 'Entwurf',
    badge: 'bg-muted/50 text-muted-foreground border border-border',
    dot: 'bg-muted-foreground',
    visibleToCutter: true,
    terminal: false,
    description: 'Clip erstellt aber noch nicht eingereicht',
  },
  submitted: {
    label: 'Eingereicht',
    labelCutter: 'Eingereicht',
    badge: 'bg-blue-500/10 text-blue-400 border border-blue-500/20',
    dot: 'bg-blue-400',
    visibleToCutter: true,
    terminal: false,
    description: 'Warten auf ersten Sync',
  },
  syncing: {
    label: '⟳ Syncing',
    labelCutter: 'Wird verarbeitet',
    badge: 'bg-sky-500/10 text-sky-400 border border-sky-500/20',
    dot: 'bg-sky-400 animate-pulse',
    visibleToCutter: true,
    terminal: false,
    description: 'Sync-Job läuft aktiv',
  },
  active: {
    label: '✓ Aktiv',
    labelCutter: 'Aktiv',
    badge: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20',
    dot: 'bg-emerald-400',
    visibleToCutter: true,
    terminal: false,
    description: 'Clip wird getrackt, keine Probleme',
  },
  under_review: {
    label: '⚠ In Prüfung',
    labelCutter: 'In Prüfung',
    badge: 'bg-orange-500/10 text-orange-400 border border-orange-500/20',
    dot: 'bg-orange-400',
    visibleToCutter: true,
    terminal: false,
    description: 'Abweichung entdeckt — Ops prüft',
  },
  resolved: {
    label: '✓ Abgeschlossen',
    labelCutter: 'Abgeschlossen',
    badge: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20',
    dot: 'bg-emerald-400',
    visibleToCutter: true,
    terminal: false,
    description: 'Geprüft und ohne Beanstandung geschlossen',
  },
  rejected: {
    label: '✕ Abgelehnt',
    labelCutter: 'Abgelehnt',
    badge: 'bg-red-500/10 text-red-400 border border-red-500/20',
    dot: 'bg-red-400',
    visibleToCutter: true,
    terminal: false,
    description: 'Von Ops abgelehnt — wird nicht abgerechnet',
  },
  archived: {
    label: 'Archiviert',
    labelCutter: 'Archiviert',
    badge: 'bg-muted/30 text-muted-foreground/60 border border-border',
    dot: 'bg-muted-foreground/40',
    visibleToCutter: false,
    terminal: true,
    description: 'Inaktiv / vergangener Abrechnungszeitraum',
  },
};

// Valid transitions: [from] → [to[]]
export const CLIP_LIFECYCLE_TRANSITIONS: Record<ClipLifecycle, ClipLifecycle[]> = {
  draft:        ['submitted', 'archived'],
  submitted:    ['syncing', 'active', 'rejected', 'archived'],
  syncing:      ['active', 'under_review', 'submitted'],
  active:       ['under_review', 'resolved', 'archived'],
  under_review: ['resolved', 'rejected', 'active'],
  resolved:     ['active', 'archived'],
  rejected:     ['archived'],
  archived:     [],
};

export function canTransition(from: ClipLifecycle, to: ClipLifecycle): boolean {
  return CLIP_LIFECYCLE_TRANSITIONS[from]?.includes(to) ?? false;
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. VERIFICATION SOURCE
// ─────────────────────────────────────────────────────────────────────────────

export type VerificationSource =
  | 'official_api'        // YouTube Data API, TikTok Business API
  | 'third_party_scraper' // Public HTML scrape
  | 'manual_proof'        // Screenshot reviewed by ops
  | 'claimed_only'        // Cutter's own report only
  | 'unavailable';        // No external data at all

export const VERIFICATION_SOURCE_CONFIG: Record<VerificationSource, {
  label: string;
  badge: string;
  confidenceBase: number;  // Base confidence 0–100
  icon: string;
  description: string;
}> = {
  official_api: {
    label: 'Offizielle API',
    badge: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20',
    confidenceBase: 95,
    icon: '🔒',
    description: 'Plattform-zertifizierte Daten (YouTube API, TikTok Business API)',
  },
  third_party_scraper: {
    label: 'Öffentlich',
    badge: 'bg-blue-500/10 text-blue-400 border border-blue-500/20',
    confidenceBase: 60,
    icon: '🔍',
    description: 'Öffentlich sichtbare Seite gescrapt — kann veraltet sein',
  },
  manual_proof: {
    label: 'Manueller Beleg',
    badge: 'bg-purple-500/10 text-purple-400 border border-purple-500/20',
    confidenceBase: 40,
    icon: '📸',
    description: 'Screenshot vom Klipper hochgeladen, von Ops geprüft',
  },
  claimed_only: {
    label: 'Nur Angabe',
    badge: 'bg-orange-500/10 text-orange-400 border border-orange-500/20',
    confidenceBase: 10,
    icon: '💬',
    description: 'Nur Eigenangabe des Klippers — keine externe Bestätigung',
  },
  unavailable: {
    label: 'Nicht verfügbar',
    badge: 'bg-muted/50 text-muted-foreground border border-border',
    confidenceBase: 0,
    icon: '—',
    description: 'Keine externen Daten verfügbar',
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 3. VERIFICATION RESULT
// ─────────────────────────────────────────────────────────────────────────────

export type VerificationResult =
  | 'verified'
  | 'partially_verified'
  | 'manual_proof'
  | 'claimed_only'
  | 'unavailable'
  | 'unverified';

export const VERIFICATION_RESULT_CONFIG: Record<VerificationResult, {
  label: string;
  labelCutter: string;
  badge: string;
  visibleToCutter: boolean;
  triggerAlert: boolean;
  description: string;
}> = {
  verified: {
    label: '✓ Verifiziert',
    labelCutter: '✓ Bestätigt',
    badge: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20',
    visibleToCutter: true,
    triggerAlert: false,
    description: 'Offizielle API bestätigt die Zahlen',
  },
  partially_verified: {
    label: '~ Teilweise',
    labelCutter: '~ In Prüfung',
    badge: 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20',
    visibleToCutter: true,
    triggerAlert: false,
    description: 'Scraper-Daten vorhanden, aber keine API-Bestätigung',
  },
  manual_proof: {
    label: 'Beleg',
    labelCutter: 'Beleg eingereicht',
    badge: 'bg-purple-500/10 text-purple-400 border border-purple-500/20',
    visibleToCutter: true,
    triggerAlert: false,
    description: 'Verifizierung per Screenshot',
  },
  claimed_only: {
    label: 'Nur Angabe',
    labelCutter: 'Ausstehend',
    badge: 'bg-orange-500/10 text-orange-400 border border-orange-500/20',
    visibleToCutter: true,
    triggerAlert: true,
    description: 'Keine externe Bestätigung verfügbar',
  },
  unavailable: {
    label: '— Nicht verfügbar',
    labelCutter: 'Wird geprüft',
    badge: 'bg-muted/50 text-muted-foreground border border-border',
    visibleToCutter: false,
    triggerAlert: false,
    description: 'Plattform-Daten nicht abrufbar',
  },
  unverified: {
    label: 'Ausstehend',
    labelCutter: 'Ausstehend',
    badge: 'bg-muted/50 text-muted-foreground border border-border',
    visibleToCutter: true,
    triggerAlert: false,
    description: 'Noch nicht verarbeitet',
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 4. DISCREPANCY RESULT
// ─────────────────────────────────────────────────────────────────────────────

export type DiscrepancyResult =
  | 'match'
  | 'minor_difference'
  | 'suspicious_difference'
  | 'critical_difference'
  | 'cannot_verify';

export const DISCREPANCY_CONFIG: Record<DiscrepancyResult, {
  label: string;
  badge: string;
  rowHighlight: string;   // CSS class for table row
  triggerAlert: boolean;
  alertSeverity: 'low' | 'medium' | 'high' | 'critical' | null;
  requestProof: boolean;  // Auto-request proof from cutter?
  triggerReview: boolean; // Auto-move clip to under_review?
  confidencePenalty: number;
  thresholdMin: number | null;
  thresholdMax: number | null;
  description: string;
}> = {
  match: {
    label: '✓ Übereinstimmung',
    badge: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20',
    rowHighlight: '',
    triggerAlert: false,
    alertSeverity: null,
    requestProof: false,
    triggerReview: false,
    confidencePenalty: 0,
    thresholdMin: null,
    thresholdMax: 5,
    description: 'Abweichung unter 5% — als korrekt gewertet',
  },
  minor_difference: {
    label: '~ Kleine Abweichung',
    badge: 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20',
    rowHighlight: 'border-l-2 border-yellow-500/50',
    triggerAlert: false,
    alertSeverity: null,
    requestProof: false,
    triggerReview: false,
    confidencePenalty: 10,
    thresholdMin: 5,
    thresholdMax: 20,
    description: '5–20% Abweichung — normal durch Verzögerungen',
  },
  suspicious_difference: {
    label: '⚠ Verdächtig',
    badge: 'bg-orange-500/10 text-orange-400 border border-orange-500/20',
    rowHighlight: 'border-l-2 border-orange-500',
    triggerAlert: true,
    alertSeverity: 'medium',
    requestProof: true,
    triggerReview: false,
    confidencePenalty: 25,
    thresholdMin: 20,
    thresholdMax: 50,
    description: '20–50% Abweichung — Beleg angefordert',
  },
  critical_difference: {
    label: '✕ Kritisch',
    badge: 'bg-red-500/10 text-red-400 border border-red-500/20',
    rowHighlight: 'border-l-2 border-red-500',
    triggerAlert: true,
    alertSeverity: 'critical',
    requestProof: true,
    triggerReview: true,
    confidencePenalty: 45,
    thresholdMin: 50,
    thresholdMax: null,
    description: 'Mehr als 50% Abweichung — automatisch zur Prüfung',
  },
  cannot_verify: {
    label: '— Nicht prüfbar',
    badge: 'bg-muted/50 text-muted-foreground border border-border',
    rowHighlight: '',
    triggerAlert: false,
    alertSeverity: null,
    requestProof: false,
    triggerReview: false,
    confidencePenalty: 0,
    thresholdMin: null,
    thresholdMax: null,
    description: 'Kein externer Vergleichswert verfügbar',
  },
};

export function classifyDiscrepancy(percent: number | null): DiscrepancyResult {
  if (percent === null) return 'cannot_verify';
  if (percent < 5) return 'match';
  if (percent < 20) return 'minor_difference';
  if (percent < 50) return 'suspicious_difference';
  return 'critical_difference';
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. SYNC STATUS
// ─────────────────────────────────────────────────────────────────────────────

export type SyncStatus =
  | 'queued'
  | 'running'
  | 'success'
  | 'partial_success'
  | 'failed'
  | 'rate_limited'
  | 'unauthorized'
  | 'unsupported';

export const SYNC_STATUS_CONFIG: Record<SyncStatus, {
  label: string;
  badge: string;
  retryable: boolean;
  retryAfterMinutes: number | null;
  logLevel: 'info' | 'warn' | 'error';
  description: string;
}> = {
  queued: {
    label: '⏳ Warteschlange',
    badge: 'bg-muted/50 text-muted-foreground border border-border',
    retryable: false,
    retryAfterMinutes: null,
    logLevel: 'info',
    description: 'Sync steht in der Warteschlange',
  },
  running: {
    label: '⟳ Läuft',
    badge: 'bg-sky-500/10 text-sky-400 border border-sky-500/20',
    retryable: false,
    retryAfterMinutes: null,
    logLevel: 'info',
    description: 'Sync wird ausgeführt',
  },
  success: {
    label: '✓ Erfolgreich',
    badge: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20',
    retryable: false,
    retryAfterMinutes: null,
    logLevel: 'info',
    description: 'Alle Daten erfolgreich aktualisiert',
  },
  partial_success: {
    label: '~ Teilweise',
    badge: 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20',
    retryable: true,
    retryAfterMinutes: 60,
    logLevel: 'warn',
    description: 'Einige Accounts konnten nicht synchronisiert werden',
  },
  failed: {
    label: '✕ Fehlgeschlagen',
    badge: 'bg-red-500/10 text-red-400 border border-red-500/20',
    retryable: true,
    retryAfterMinutes: 30,
    logLevel: 'error',
    description: 'Sync komplett fehlgeschlagen',
  },
  rate_limited: {
    label: '⏱ Rate Limit',
    badge: 'bg-orange-500/10 text-orange-400 border border-orange-500/20',
    retryable: true,
    retryAfterMinutes: 60,
    logLevel: 'warn',
    description: 'API-Limit erreicht — automatischer Retry in 60 Min',
  },
  unauthorized: {
    label: '🔑 Kein Zugriff',
    badge: 'bg-red-500/10 text-red-400 border border-red-500/20',
    retryable: false,
    retryAfterMinutes: null,
    logLevel: 'error',
    description: 'API-Token abgelaufen oder widerrufen — manuell erneuern',
  },
  unsupported: {
    label: '— Nicht unterstützt',
    badge: 'bg-muted/50 text-muted-foreground border border-border',
    retryable: false,
    retryAfterMinutes: null,
    logLevel: 'warn',
    description: 'Plattform unterstützt noch keinen automatischen Sync',
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 6. PROOF WORKFLOW
// ─────────────────────────────────────────────────────────────────────────────

export type ProofStatus =
  | 'no_proof_needed'
  | 'proof_requested'
  | 'proof_submitted'
  | 'proof_under_review'
  | 'proof_approved'
  | 'proof_rejected';

export const PROOF_STATUS_CONFIG: Record<ProofStatus, {
  label: string;
  labelCutter: string;
  badge: string;
  actionRequired: 'cutter' | 'ops' | 'none';
  visibleToCutter: boolean;
  terminal: boolean;
  description: string;
}> = {
  no_proof_needed: {
    label: 'Kein Beleg nötig',
    labelCutter: '—',
    badge: 'bg-muted/30 text-muted-foreground/60 border border-border',
    actionRequired: 'none',
    visibleToCutter: false,
    terminal: false,
    description: 'Verifizierung über API oder Scraper ausreichend',
  },
  proof_requested: {
    label: '📋 Beleg angefordert',
    labelCutter: '⚠ Screenshot hochladen',
    badge: 'bg-orange-500/10 text-orange-400 border border-orange-500/20',
    actionRequired: 'cutter',
    visibleToCutter: true,
    terminal: false,
    description: 'Klipper muss Screenshot hochladen',
  },
  proof_submitted: {
    label: '📸 Beleg eingereicht',
    labelCutter: '📸 Eingereicht',
    badge: 'bg-blue-500/10 text-blue-400 border border-blue-500/20',
    actionRequired: 'ops',
    visibleToCutter: true,
    terminal: false,
    description: 'Screenshot hochgeladen — wartet auf Ops-Prüfung',
  },
  proof_under_review: {
    label: '🔍 In Prüfung',
    labelCutter: 'Wird geprüft',
    badge: 'bg-purple-500/10 text-purple-400 border border-purple-500/20',
    actionRequired: 'ops',
    visibleToCutter: true,
    terminal: false,
    description: 'Ops prüft gerade den Beleg',
  },
  proof_approved: {
    label: '✓ Beleg genehmigt',
    labelCutter: '✓ Genehmigt',
    badge: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20',
    actionRequired: 'none',
    visibleToCutter: true,
    terminal: false,
    description: 'Beleg akzeptiert — wird für Abrechnung anerkannt',
  },
  proof_rejected: {
    label: '✕ Beleg abgelehnt',
    labelCutter: '✕ Abgelehnt — neu hochladen',
    badge: 'bg-red-500/10 text-red-400 border border-red-500/20',
    actionRequired: 'cutter',
    visibleToCutter: true,
    terminal: false,
    description: 'Beleg nicht akzeptiert — Klipper muss neuen einreichen',
  },
};

export const PROOF_TRANSITIONS: Record<ProofStatus, ProofStatus[]> = {
  no_proof_needed:    ['proof_requested'],
  proof_requested:    ['proof_submitted'],
  proof_submitted:    ['proof_under_review', 'proof_rejected'],
  proof_under_review: ['proof_approved', 'proof_rejected'],
  proof_approved:     ['proof_requested'],  // can re-request if needed
  proof_rejected:     ['proof_submitted'],  // cutter resubmits
};

// ─────────────────────────────────────────────────────────────────────────────
// BUSINESS LOGIC RULES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Given a discrepancy result, what actions should be taken automatically?
 */
export function getAutoActions(discrepancy: DiscrepancyResult): {
  requestProof: boolean;
  moveToReview: boolean;
  createAlert: boolean;
  alertSeverity: 'medium' | 'high' | 'critical' | null;
  confidencePenalty: number;
} {
  const cfg = DISCREPANCY_CONFIG[discrepancy];
  return {
    requestProof: cfg.requestProof,
    moveToReview: cfg.triggerReview,
    createAlert: cfg.triggerAlert,
    alertSeverity: cfg.alertSeverity as 'medium' | 'high' | 'critical' | null,
    confidencePenalty: cfg.confidencePenalty,
  };
}

/**
 * Compute confidence from source + discrepancy + proof state.
 */
export function computeConfidence(
  source: VerificationSource,
  discrepancy: DiscrepancyResult,
  proofStatus: ProofStatus
): number {
  const base = VERIFICATION_SOURCE_CONFIG[source].confidenceBase;
  const penalty = DISCREPANCY_CONFIG[discrepancy].confidencePenalty;
  const proofBonus = proofStatus === 'proof_approved' ? 15 : 0;
  return Math.max(0, Math.min(100, base - penalty + proofBonus));
}

/**
 * Get the confidence tier label and color.
 */
export function getConfidenceTier(confidence: number): {
  label: string;
  color: string;
} {
  if (confidence >= 80) return { label: 'Hoch', color: 'text-emerald-400' };
  if (confidence >= 50) return { label: 'Mittel', color: 'text-yellow-400' };
  if (confidence >= 20) return { label: 'Niedrig', color: 'text-orange-400' };
  return { label: 'Sehr niedrig', color: 'text-red-400' };
}

/**
 * Given a proof status string from DB, normalize to ProofStatus.
 * DB currently stores: 'none', 'submitted', 'approved', 'rejected', 'requested'
 */
export function normalizeProofStatus(dbValue: string | null): ProofStatus {
  const map: Record<string, ProofStatus> = {
    none:      'no_proof_needed',
    requested: 'proof_requested',
    submitted: 'proof_submitted',
    review:    'proof_under_review',
    approved:  'proof_approved',
    rejected:  'proof_rejected',
  };
  return map[dbValue ?? 'none'] ?? 'no_proof_needed';
}

/**
 * What a cutter should do next, given current clip state.
 * Returns null if no action needed.
 */
export function getCutterNextAction(
  lifecycle: ClipLifecycle,
  proofStatus: ProofStatus
): { message: string; urgent: boolean } | null {
  if (proofStatus === 'proof_requested') {
    return { message: 'Screenshot hochladen — Beleg angefordert', urgent: true };
  }
  if (proofStatus === 'proof_rejected') {
    return { message: 'Beleg erneut einreichen — vorheriger abgelehnt', urgent: true };
  }
  if (lifecycle === 'rejected') {
    return { message: 'Clip wurde abgelehnt — nicht abrechenbar', urgent: false };
  }
  if (lifecycle === 'under_review') {
    return { message: 'Clip wird geprüft — kein Handlungsbedarf', urgent: false };
  }
  return null;
}
