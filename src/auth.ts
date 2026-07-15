import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

function getAllowedEmails(): Set<string> {
  return new Set(
    (process.env.ALLOWED_EMAILS || "")
      .split(",")
      .map((e) => e.trim().toLowerCase().replace(/^["']|["']$/g, ""))
      .filter(Boolean)
  );
}

export function isEmailAllowed(email: string | null | undefined): boolean {
  if (!email) return false;
  const allowed = getAllowedEmails();
  if (allowed.size === 0) {
    // Fail closed in production if allowlist is empty
    if (process.env.NODE_ENV === "production") return false;
    // In development, warn and allow any verified Google user when unset
    console.warn(
      "[auth] ALLOWED_EMAILS is empty — allowing any Google sign-in in development only"
    );
    return true;
  }
  return allowed.has(email.toLowerCase());
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google],
  pages: {
    signIn: "/login",
    error: "/login",
  },
  callbacks: {
    async signIn({ account, profile }) {
      if (account?.provider !== "google") return false;
      const email = profile?.email;
      const verified =
        typeof profile === "object" &&
        profile !== null &&
        "email_verified" in profile
          ? Boolean((profile as { email_verified?: boolean }).email_verified)
          : true;
      if (!verified) return false;
      if (!isEmailAllowed(email)) {
        console.warn(`[auth] Blocked sign-in for non-allowlisted email: ${email}`);
        return false;
      }
      return true;
    },
    // Route protection lives in src/proxy.ts (401 for APIs, redirect for pages).
    authorized: () => true,
  },
  trustHost: true,
});
