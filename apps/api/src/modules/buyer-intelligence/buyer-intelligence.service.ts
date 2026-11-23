import { Injectable, NotFoundException } from '@nestjs/common';
import type {
  IdentityStatus,
  VisitorEventType,
  VisitorSession,
} from '@dostelo/types';
import type { StoredVisitorEvent } from '../../store/in-memory.store';
import { VisitorsService } from '../visitors/visitors.service';
import { computeLeadScore, type LeadScore } from './lead-score';

/**
 * A staff-facing view of one visitor session: identity status as
 * recorded (never inferred), activity aggregates, the latest cart
 * value, and the transparent lead score. Contact details are
 * deliberately absent here; a session summary is behavioural
 * data, and contact happens through leads, where the contact
 * basis is recorded and checked.
 */
export interface BuyerSessionSummary {
  sessionId: string;
  visitorId: string;
  identityStatus: IdentityStatus;
  customerId: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  eventCount: number;
  eventCounts: Partial<Record<VisitorEventType, number>>;
  productViews: number;
  /** Latest cart value reported for the session, minor units. */
  cartValueMinor: number;
  leadScore: number;
  leadBand: LeadScore['band'];
  /** False when the visitor denied the marketing scope: this
   * session's data is operational only. */
  marketingUsable: boolean;
}

export interface BuyerSessionDetail extends BuyerSessionSummary {
  scoreBreakdown: LeadScore['breakdown'];
  events: StoredVisitorEvent[];
}

@Injectable()
export class BuyerIntelligenceService {
  constructor(private readonly visitors: VisitorsService) {}

  private async summarize(
    session: VisitorSession,
    events: StoredVisitorEvent[],
  ): Promise<BuyerSessionSummary> {
    const eventCounts: Partial<Record<VisitorEventType, number>> = {};
    let maxCartValueMinor = 0;
    let latestCartValueMinor = 0;
    for (const event of events) {
      eventCounts[event.type] = (eventCounts[event.type] ?? 0) + 1;
      const cartValue = event.payload?.['cartValueMinor'];
      if (typeof cartValue === 'number') {
        latestCartValueMinor = cartValue;
        if (cartValue > maxCartValueMinor) maxCartValueMinor = cartValue;
      }
    }
    const visitorSessionCount = (await this.visitors.listSessionsForVisitor(
      session.visitorId,
    )).length;
    const lead = computeLeadScore({
      lastActivityAt: session.lastSeenAt,
      eventCounts,
      maxCartValueMinor,
      visitorSessionCount,
    });
    return {
      sessionId: session.id,
      visitorId: session.visitorId,
      identityStatus: session.identityStatus,
      customerId: session.customerId,
      firstSeenAt: session.firstSeenAt,
      lastSeenAt: session.lastSeenAt,
      eventCount: events.length,
      eventCounts,
      productViews: eventCounts['product-view'] ?? 0,
      cartValueMinor: latestCartValueMinor,
      leadScore: lead.score,
      leadBand: lead.band,
      marketingUsable: await this.visitors.marketingUsable(session.visitorId),
    };
  }

  /** Facts for one session, for the leads module's candidate
   * evaluation: the same summary staff see, nothing more. */
  async summarizeSession(session: VisitorSession): Promise<BuyerSessionSummary> {
    return this.summarize(
      session,
      await this.visitors.listEventsForSession(session.id),
    );
  }

  async listSessions(filter: {
    status?: IdentityStatus;
    minScore?: number;
  }): Promise<BuyerSessionSummary[]> {
    const summaries = await Promise.all(
      (await this.visitors.listSessions()).map((session) =>
        this.summarizeSession(session),
      ),
    );
    return summaries
      .filter((summary) => {
        if (filter.status && summary.identityStatus !== filter.status) {
          return false;
        }
        if (
          filter.minScore !== undefined &&
          summary.leadScore < filter.minScore
        ) {
          return false;
        }
        return true;
      })
      .sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt));
  }

  async getSession(sessionId: string): Promise<BuyerSessionDetail> {
    const session = await this.visitors.getSession(sessionId);
    if (!session) {
      throw new NotFoundException(`Visitor session not found: ${sessionId}`);
    }
    const events = (await this.visitors.listEventsForSession(sessionId)).sort(
      (a, b) => a.occurredAt.localeCompare(b.occurredAt),
    );
    const summary = await this.summarize(session, events);
    const lead = computeLeadScore({
      lastActivityAt: session.lastSeenAt,
      eventCounts: summary.eventCounts,
      maxCartValueMinor: events.reduce((max, event) => {
        const value = event.payload?.['cartValueMinor'];
        return typeof value === 'number' && value > max ? value : max;
      }, 0),
      visitorSessionCount: (await this.visitors.listSessionsForVisitor(
        session.visitorId,
      )).length,
    });
    return { ...summary, scoreBreakdown: lead.breakdown, events };
  }
}
