/**
 * Clerk (the Referral360 application) signs people in when its keys are set.
 * Without them the app keeps the single username login, so a deploy before
 * the keys reach Render changes nothing. That login stays afterwards too, as
 * the Paragon admin fallback.
 */
export function clerkEnabled(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim() && process.env.CLERK_SECRET_KEY?.trim());
}

/** For client code, which only sees the publishable key. */
export const clerkPublishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim() || null;
