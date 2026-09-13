export const DEFAULT_TARGET = 100;
export const MIN_TARGET = 1;
export const MAX_TARGET = 100_000;

export function isValidTarget(target: number): boolean {
  return Number.isInteger(target) && target >= MIN_TARGET && target <= MAX_TARGET;
}
