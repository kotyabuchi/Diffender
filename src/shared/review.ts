import type { ReviewSnapshot } from "./contracts";

export function updateGroupApproval(
  snapshot: ReviewSnapshot,
  groupId: string,
  approved: boolean,
): ReviewSnapshot {
  let changed = false;
  const groups = snapshot.groups.map((group) => {
    if (group.id !== groupId || group.approved === approved) return group;
    changed = true;
    return { ...group, approved };
  });

  return changed ? { ...snapshot, groups } : snapshot;
}
