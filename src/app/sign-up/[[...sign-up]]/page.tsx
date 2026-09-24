import { redirect } from 'next/navigation';
import { SignUp } from '@clerk/nextjs';
import { clerkEnabled } from '@/lib/clerk-config';

/** Where an invitation to a subscriber organization lands. */
export default function SignUpPage() {
  if (!clerkEnabled()) redirect('/login');
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-12">
      <SignUp path="/sign-up" routing="path" signInUrl="/sign-in" fallbackRedirectUrl="/" />
    </div>
  );
}
