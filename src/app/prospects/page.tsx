import { redirect } from 'next/navigation';

/** Prospects became the practices not yet scored, on Referral Sources. */
export default function ProspectsPage() {
  redirect('/referral-sources?tier=unscored');
}
