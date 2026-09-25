'use client';

import { useEffect } from 'react';

/**
 * Where a Clerk invitation link lands. Clerk says whether the person needs an
 * account (sign_up), already has one (sign_in), or is already in (complete);
 * the ticket goes along so the invitation is accepted as they finish.
 */
export default function AcceptInvitePage() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get('__clerk_status');
    const target = status === 'complete' ? '/' : status === 'sign_in' ? '/sign-in' : '/sign-up';
    window.location.replace(status === 'complete' ? target : `${target}?${params.toString()}`);
  }, []);
  return <p className="p-8 text-center text-sm text-gray-600">Opening your invitation…</p>;
}
