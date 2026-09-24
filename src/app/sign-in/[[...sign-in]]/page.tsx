import Link from 'next/link';
import { redirect } from 'next/navigation';
import { SignIn } from '@clerk/nextjs';
import { clerkEnabled } from '@/lib/clerk-config';

export default function SignInPage() {
  if (!clerkEnabled()) redirect('/login');
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-gray-50 px-4 py-12">
      <SignIn path="/sign-in" routing="path" signUpUrl="/sign-up" fallbackRedirectUrl="/" />
      <Link href="/login" className="text-sm text-gray-500 hover:text-gray-700">
        Paragon staff: sign in with the admin username
      </Link>
    </div>
  );
}
