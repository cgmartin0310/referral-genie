'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import toast from 'react-hot-toast';
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

function errorMessage(error: unknown, fallback: string): string {
  return (axios.isAxiosError(error) ? error.response?.data?.error : null) || fallback;
}

const inputClass = 'block w-full rounded-md border-gray-300 text-sm shadow-sm focus:border-green-500 focus:ring-green-500';

/** Company name and owner email: creates the subscriber and emails the owner an invitation. */
function AddSubscriber({ onAdded }: { onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const { data } = await axios.post('/api/admin/subscribers', { name, ownerEmail });
      if (data.inviteError) toast.error(`${name} was added, but the invitation failed: ${data.inviteError}. Send it again from its row.`, { duration: 10000 });
      else toast.success(`${name} added. ${data.invited} has been emailed an invitation.`);
      setName('');
      setOwnerEmail('');
      setOpen(false);
      onAdded();
    } catch (error) {
      toast.error(errorMessage(error, 'Could not add the subscriber'));
    } finally {
      setSaving(false);
    }
  };

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="rounded-md bg-green-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-green-500">
        Add subscriber
      </button>
    );
  }
  return (
    <form onSubmit={submit} className="mt-4 grid max-w-3xl gap-3 rounded-lg border border-gray-200 bg-white p-4 shadow-sm sm:grid-cols-[1fr_1fr_auto]">
      <label className="text-sm">
        <span className="mb-1 block font-medium text-gray-700">Company name</span>
        <input className={inputClass} value={name} onChange={(event) => setName(event.target.value)} placeholder="Kidology" required autoFocus />
      </label>
      <label className="text-sm">
        <span className="mb-1 block font-medium text-gray-700">Owner’s email</span>
        <input className={inputClass} type="email" value={ownerEmail} onChange={(event) => setOwnerEmail(event.target.value)} placeholder="owner@kidology.com" required />
      </label>
      <div className="flex items-end gap-2">
        <button type="submit" disabled={saving} className="rounded-md bg-green-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-green-500 disabled:opacity-50">
          {saving ? 'Adding…' : 'Add and invite'}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="rounded-md px-3 py-2 text-sm text-gray-600 hover:bg-gray-50">
          Cancel
        </button>
      </div>
      <p className="text-xs text-gray-500 sm:col-span-3">
        The owner gets an email to set up their account, then lands in onboarding. Owners invite their own staff from the organization menu.
      </p>
    </form>
  );
}

/** Send an invitation to someone at an existing subscriber. */
function InviteButton({ subscriber }: { subscriber: Subscriber }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'admin' | 'member'>('admin');
  const [sending, setSending] = useState(false);
  if (!subscriber.id || !subscriber.clerkOrgId || subscriber.kind === 'paragon') return null;

  const send = async (event: React.FormEvent) => {
    event.preventDefault();
    setSending(true);
    try {
      await axios.post(`/api/admin/subscribers/${subscriber.id}/invitations`, { email, role });
      toast.success(`Invitation sent to ${email}.`);
      setEmail('');
      setOpen(false);
    } catch (error) {
      toast.error(errorMessage(error, 'The invitation was not sent'));
    } finally {
      setSending(false);
    }
  };

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-sm font-medium text-green-700 hover:text-green-600">
        Invite
      </button>
    );
  }
  return (
    <form onSubmit={send} className="flex flex-wrap items-center justify-end gap-2">
      <input className={`${inputClass} w-52`} type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@company.com" required autoFocus />
      <select className={`${inputClass} w-28`} value={role} onChange={(event) => setRole(event.target.value as 'admin' | 'member')}>
        <option value="admin">Owner</option>
        <option value="member">Staff</option>
      </select>
      <button type="submit" disabled={sending} className="rounded-md bg-green-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-green-500 disabled:opacity-50">
        {sending ? 'Sending…' : 'Send'}
      </button>
      <button type="button" onClick={() => setOpen(false)} className="text-xs text-gray-500 hover:text-gray-700">Cancel</button>
    </form>
  );
}

/** Paragon's view of every subscriber and how far each has set up. */
export default function SubscribersPage() {
  const queryClient = useQueryClient();
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
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900">Subscribers</h1>
          <p className="mt-1 max-w-3xl text-sm text-gray-600">
            Each subscriber is a company with its own clinics, referral lists, and campaigns. The referral-source catalog is shared.
          </p>
        </div>
        {data?.clerk && <AddSubscriber onAdded={() => queryClient.invalidateQueries({ queryKey: ['admin-subscribers'] })} />}
      </div>
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
              <th className="px-3 py-3 text-right">Activity</th>
              <th className="px-5 py-3"><span className="sr-only">Invite</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading || !me ? (
              <tr><td colSpan={8} className="px-5 py-8 text-center text-gray-500">Loading…</td></tr>
            ) : error ? (
              <tr><td colSpan={8} className="px-5 py-8 text-center text-red-600">Could not load subscribers.</td></tr>
            ) : (
              subscribers.map((row) => (
                <tr key={row.id ?? row.clerkOrgId ?? row.name}>
                  <td className="px-5 py-3 font-medium text-gray-900">{row.name}</td>
                  <td className="px-3 py-3">
                    <span
                      className={classNames(
                        'whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium',
                        row.kind === 'paragon' ? 'bg-blue-50 text-blue-700' : row.signedIn && row.members !== 0 ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-600',
                      )}
                    >
                      {row.kind === 'paragon' ? 'Paragon' : !row.signedIn ? 'Not signed in yet' : row.members === 0 ? 'No one joined yet' : 'Active'}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-right text-gray-700">{row.members ?? '—'}</td>
                  <td className="px-3 py-3 text-right text-gray-700">{row.clinics}</td>
                  <td className="px-3 py-3 text-right text-gray-700">{row.listed}</td>
                  <td className="px-3 py-3 text-right text-gray-700">{row.campaigns}</td>
                  <td className="px-3 py-3 text-right text-gray-700">{row.activity}</td>
                  <td className="px-5 py-3 text-right"><InviteButton subscriber={row} /></td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </MainLayout>
  );
}
