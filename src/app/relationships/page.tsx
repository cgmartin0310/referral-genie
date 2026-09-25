'use client';

import MainLayout from '@/components/layout/MainLayout';
import ReferralListManager from '@/components/referral-list/ReferralListManager';

/** Your Sources: every practice on your clinics' referral lists, scored by tier. */
export default function YourSourcesPage() {
  return (
    <MainLayout>
      <ReferralListManager />
    </MainLayout>
  );
}
