export const RED_FLAG = '\u{1F6A9}';

/** True if the comment contains at least one 🚩; any number of flags counts once. */
export function containsRedFlag(comment: string): boolean {
  return comment.includes(RED_FLAG);
}
