import type { LeadStatus } from '@dostelo/types';

/**
 * Legal lead pipeline transitions, following the master
 * structure's pipeline order (New, Qualified, Contacted,
 * Interested, Follow-up Required, Negotiation, Converted, Lost,
 * Do Not Contact). A lead can move forward through the pipeline,
 * drop back to Follow-up Required from any active stage, or be
 * marked Lost from any active stage. Converted is reached by an
 * order placement (the service also accepts it as a manual move
 * for offline orders). Do Not Contact is reached only through an
 * opt-out and is terminal: nothing leaves it, so an opt-out can
 * never be quietly undone from the pipeline.
 */
const ACTIVE: LeadStatus[] = [
  'new',
  'qualified',
  'contacted',
  'interested',
  'follow-up-required',
  'negotiation',
];

const LEGAL: Record<LeadStatus, LeadStatus[]> = {
  new: ['qualified', 'contacted', 'follow-up-required', 'lost'],
  qualified: ['contacted', 'interested', 'follow-up-required', 'lost'],
  contacted: [
    'interested',
    'follow-up-required',
    'negotiation',
    'converted',
    'lost',
  ],
  interested: ['negotiation', 'follow-up-required', 'converted', 'lost'],
  'follow-up-required': [
    'contacted',
    'interested',
    'negotiation',
    'converted',
    'lost',
  ],
  negotiation: ['converted', 'follow-up-required', 'lost'],
  converted: [],
  lost: [],
  'do-not-contact': [],
};

export function isLegalLeadTransition(
  from: LeadStatus,
  to: LeadStatus,
): boolean {
  if (from === to) return false;
  // Opt-out is the only road into Do Not Contact.
  if (to === 'do-not-contact') return false;
  return LEGAL[from].includes(to);
}

export function isActiveLeadStatus(status: LeadStatus): boolean {
  return ACTIVE.includes(status);
}

/** Statuses from which no further pipeline work happens. */
export function isTerminalLeadStatus(status: LeadStatus): boolean {
  return status === 'converted' || status === 'lost' || status === 'do-not-contact';
}
