import type { Procurement } from '@/lib/state/fyll-store';

// Who submitted a purchase order, and what has happened to it, for the PO detail page and panel.
//
// A purchase order keeps its approval history inside its notes as [key:value] tags (submitted_by_name, submitted_at,
// approval_status, reviewed_by_name, reviewed_at). Edits made afterwards are not recorded, so they do not appear here.

export type ProcurementActivityEntry = {
  label: string;
  at: string; // may be empty when the order never stored a time for that step
  actorName: string;
};

const readMetadata = (notes: string | undefined, key: string): string | null => {
  if (!notes) return null;
  const pattern = /\[([a-z_]+):([^\]]+)\]/gi;
  let match = pattern.exec(notes);
  while (match) {
    if (match[1]?.toLowerCase() === key) return match[2]?.trim() ?? null;
    match = pattern.exec(notes);
  }
  return null;
};

export const getProcurementSubmitter = (procurement: Pick<Procurement, 'notes' | 'createdBy'>): string => (
  readMetadata(procurement.notes, 'submitted_by_name')?.trim() || procurement.createdBy?.trim() || ''
);

// Newest first (the order the steps happen in, reversed). A step with no stored time is still listed.
export const getProcurementActivity = (
  procurement: Pick<Procurement, 'notes' | 'createdBy' | 'createdAt'>
): ProcurementActivityEntry[] => {
  const submittedByName = readMetadata(procurement.notes, 'submitted_by_name');
  const approvalStatus = readMetadata(procurement.notes, 'approval_status');
  const steps: ProcurementActivityEntry[] = [
    { label: 'PO created', at: procurement.createdAt, actorName: submittedByName || procurement.createdBy || 'Admin' },
  ];

  if (approvalStatus === 'submitted' || approvalStatus === 'approved' || approvalStatus === 'rejected') {
    steps.push({
      label: 'Submitted for approval',
      at: readMetadata(procurement.notes, 'submitted_at') || procurement.createdAt,
      actorName: submittedByName || 'Team member',
    });
  }
  if (approvalStatus === 'approved') {
    steps.push({ label: 'PO approved', at: readMetadata(procurement.notes, 'reviewed_at') || '', actorName: readMetadata(procurement.notes, 'reviewed_by_name') || 'Admin' });
  } else if (approvalStatus === 'rejected') {
    steps.push({ label: 'PO declined', at: readMetadata(procurement.notes, 'reviewed_at') || '', actorName: readMetadata(procurement.notes, 'reviewed_by_name') || 'Admin' });
  }

  return steps.reverse();
};
