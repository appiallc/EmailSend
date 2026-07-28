/** Placeholder returned by the settings API when a password is already saved. */
export const PASSWORD_MASK = "••••••••";

export function isPasswordMasked(value: string | null | undefined) {
  return value === PASSWORD_MASK;
}
