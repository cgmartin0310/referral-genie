'use client';

import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import MainLayout from '@/components/layout/MainLayout';
import { useTenant } from '@/lib/use-tenant';

interface Subscriber {
  id: string | null;
  name: string;
  kind: string;
  clerkOrgId: string | null;
  members: number | null;
  signedIn: boolean;
  clinics: number;
  listed: number;
  campaigns: number;
  activity: number;
  createdAt: string | null;
}

interface Response {
  subscribers: Subscriber[];
  clerk: boolean;
  clerkError: string | null;
}

function classNames(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(' ');
}

/** Paragon's view of every subscriber and how far each has set up. */
export default function SubscribersPage() {
  const { data: me } = useTenant();
  const { data, isLoading, error } = useQuery({
    queryKey: ['admin-subscribers'],
    queryFn: async () => (await axios.get<Response>('/api/admin/subscribers')).data,
    enabled: me?.isParagon === true,
  });

  if (me && !me.isParagon) {
    return (
      <MainLayout>
        <p className="text-sm text-gray-600">This page is for Paragon.</p>
      </MainLayout>
    );
  }

  const subscribers = data?.subscribers ?? [];
  return (
    <MainLayout>
      <h1 className="text-2xl font-semibold tracking-tight text-gray-900">Subscribers</h1>
      <p className="mt-1 max-w-3xl text-sm text-gray-600">
        Each subscriber is a Clerk organization. Create one and invite its owner in the Clerk dashboard (Organizations);
        it appears here, and its data is set up the first time someone signs into it.
      </p>
      {data && !data.clerk && (
        <p className="mt-4 rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Clerk is not configured on this server, so only Paragon is listed. Add the Clerk keys to turn on subscriber sign-in.
        </p>
      )}
      {data?.clerkError && (
        <p className="mt-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">Could not reach Clerk: {data.clerkError}</p>
      )}

      <div className="mt-6 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-5 py-3">Subscriber</th>
              <th className="px-3 py-3">Status</th>
              <th className="px-3 py-3 text-right">Members</th>
              <th className="px-3 py-3 text-right">Clinics</th>
              <th className="px-3 py-3 text-right">On referral lists</th>
              <th className="px-3 py-3 text-right">Campaigns</th>
              <th className="px-5 py-3 text-right">Activity</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading || !me ? (
              <tr><td colSpan={7} className="px-5 py-8 text-center text-gray-500">Loading…</td></tr>
            ) : error ? (
              <tr><td colSpan={7} className="px-5 py-8 text-center text-red-600">Could not load subscribers.</td></tr>
            ) : (
              subscribers.map((row) => (
                <tr key={row.id ?? row.clerkOrgId ?? row.name}>
                  <td className="px-5 py-3 font-medium text-gray-900">{row.name}</td>
                  <td className="px-3 py-3">
                    <span
                      className={classNames(
                        'rounded-full px-2 py-0.5 text-xs font-medium',
                        row.kind === 'paragon' ? 'bg-blue-50 text-blue-700' : row.signedIn ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-600',
                      )}
                    >
                      {row.kind === 'paragon' ? 'Paragon' : row.signedIn ? 'Active' : 'Not signed in yet'}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-right text-gray-700">{row.members ?? '—'}</td>
                  <td className="px-3 py-3 text-right text-gray-700">{row.clinics}</td>
                  <td className="px-3 py-3 text-right text-gray-700">{row.listed}</td>
                  <td className="px-3 py-3 text-right text-gray-700">{row.campaigns}</td>
                  <td className="px-5 py-3 text-right text-gray-700">{row.activity}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </MainLayout>
  );
}
