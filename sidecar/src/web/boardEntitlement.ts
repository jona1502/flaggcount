import { canUse } from '../../../shared/entitlements';
import { evaluateEntitlement, parseSignedEntitlement, type EntitlementVerifier } from '../../../shared/licensing';

/** A board relay is opened only by an authentic, unexpired entitlement with parallel counters. */
export function acceptsBoardEntitlement(
  value: unknown,
  verify: EntitlementVerifier,
  now: () => number = Date.now
): boolean {
  const entitlement = parseSignedEntitlement(value);
  if (!entitlement) return false;
  const evaluation = evaluateEntitlement(entitlement, {
    installationId: entitlement.installationId,
    now: now(),
    verify
  });
  return canUse(evaluation.entitlements, 'parallel-counters');
}
