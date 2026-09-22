import { redirect } from 'next/navigation';

/** Pulling a county's referral sources lives on the Referral Sources page. */
export default function PullSourcesRedirect() {
  redirect('/referral-sources');
}
