// TikTok handles: letters, digits, underscores and periods, 2 to 24 characters.
const USERNAME_PATTERN = /^[A-Za-z0-9._]{2,24}$/;
const PROFILE_URL_PATTERN = /tiktok\.com\/@([^/?#\s]+)/i;

/**
 * Accepts `name`, `@name` or a TikTok profile/live URL and returns the lowercase
 * handle, or `null` if the input is not a valid TikTok username.
 */
export function normalizeUsername(input: string): string | null {
  let value = input.trim();

  const urlMatch = PROFILE_URL_PATTERN.exec(value);
  if (urlMatch?.[1]) {
    value = urlMatch[1];
  }

  value = value.replace(/^@/, '');
  return USERNAME_PATTERN.test(value) ? value.toLowerCase() : null;
}
