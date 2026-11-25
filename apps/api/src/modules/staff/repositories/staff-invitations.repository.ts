import type { Tx } from '../../../prisma/prisma.service';
import type { StoredStaffInvitation } from '../../../store/in-memory.store';

/**
 * Staff invitation persistence seam (Staff redesign). Only the
 * token hash is stored; the raw token exists once, in the
 * response to the inviting admin.
 */
export abstract class StaffInvitationsRepository {
  abstract create(
    invitation: StoredStaffInvitation,
    tx?: Tx,
  ): Promise<void>;
  abstract findByTokenHash(
    tokenHash: string,
    tx?: Tx,
  ): Promise<StoredStaffInvitation | null>;
  abstract save(invitation: StoredStaffInvitation, tx?: Tx): Promise<void>;
}
