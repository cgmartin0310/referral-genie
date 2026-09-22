import { redirect } from 'next/navigation';

/**
 * Pulling, enriching, and researching sources happens on a clinic's page
 * under Market & data. This route stays so old links keep working.
 */
export default function PullSourcesRedirect() {
  redirect('/clinic-locations');
}
