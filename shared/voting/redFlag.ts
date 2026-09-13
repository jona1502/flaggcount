export const RED_FLAG = '\u{1F6A9}';
export const WHITE_FLAG = '\u{1F3F3}';

/** True if the comment contains at least one 🚩; any number of flags counts once. */
export function containsRedFlag(comment: string): boolean {
  return comment.includes(RED_FLAG);
}

/** True if the comment contains at least one 🏳️, with or without its emoji variation selector. */
export function containsWhiteFlag(comment: string): boolean {
  return comment.includes(WHITE_FLAG);
}
