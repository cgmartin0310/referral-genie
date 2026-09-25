'use client';

import { useEffect, useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { Dialog } from '@headlessui/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

interface MoveOptions {
  from: { id: string; name: string };
  organizations: { id: string; name: string; kind: string }[];
  clinics: { id: string; name: string; place: string; listed: number; campaigns: number }[];
  campaignsWithoutClinic: { id: string; name: string; status: string; createdAt: string }[];
}

interface Summary {
  clinics: number;
  listed: number;
  campaigns: number;
  faxPages: number;
  relationships: number;
}

function plural(count: number, word: string, many = `${word}s`): string {
  return `${count.toLocaleString()} ${count === 1 ? word : many}`;
}

function summaryText(summary: Summary): string {
  return [
    plural(summary.clinics, 'clinic'),
    plural(summary.listed, 'practice on referral lists', 'practices on referral lists'),
    plural(summary.campaigns, 'campaign'),
    plural(summary.faxPages, 'fax page'),
    plural(summary.relationships, 'Your Sources entry', 'Your Sources entries'),
  ].join(' · ');
}

function errorMessage(error: unknown, fallback: string): string {
  return (axios.isAxiosError(error) ? error.response?.data?.error : null) || fallback;
}

/**
 * Paragon moves clinics to a subscriber. Everything tied to a clinic goes
 * with it: its referral list, campaigns and fax pages, and Your Sources
 * entries. The shared catalog stays shared.
 */
export default function MoveToSubscriber() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState('');
  const [clinicIds, setClinicIds] = useState<string[]>([]);
  const [campaignIds, setCampaignIds] = useState<string[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [moving, setMoving] = useState(false);

  const { data: options } = useQuery({
    queryKey: ['move-options'],
    queryFn: async () => (await axios.get<MoveOptions>('/api/admin/moves')).data,
    enabled: open,
  });

  // What the chosen move would take, recounted whenever the choice changes.
  useEffect(() => {
    setSummary(null);
    setProblem(null);
    if (!open || !to || (clinicIds.length === 0 && campaignIds.length === 0)) return;
    let cancelled = false;
    axios
      .post('/api/admin/moves', { toOrganizationId: to, clinicIds, campaignIds })
      .then(({ data }) => !cancelled && setSummary(data.summary))
      .catch((error) => !cancelled && setProblem(errorMessage(error, 'Could not check this move')));
    return () => {
      cancelled = true;
    };
  }, [open, to, clinicIds, campaignIds]);

  const close = () => {
    setOpen(false);
    setTo('');
    setClinicIds([]);
    setCampaignIds([]);
  };

  const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((item) => item !== id) : [...list, id]);
  const target = options?.organizations.find((organization) => organization.id === to);

  const move = async () => {
    if (!summary || !target) return;
    if (!confirm(`Move ${summaryText(summary)} to ${target.name}? ${options?.from.name} will no longer see them.`)) return;
    setMoving(true);
    try {
      await axios.post('/api/admin/moves', { toOrganizationId: to, clinicIds, campaignIds, confirm: true });
      toast.success(`Moved to ${target.name}.`);
      queryClient.invalidateQueries();
      close();
    } catch (error) {
      toast.error(errorMessage(error, 'The move failed; nothing was moved.'));
    } finally {
      setMoving(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
      >
        Move to subscriber…
      </button>
      <Dialog open={open} onClose={close} className="relative z-50">
        <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
        <div className="fixed inset-0 flex items-center justify-center p-4">
          <Dialog.Panel className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
            <Dialog.Title className="text-lg font-medium text-gray-900">Move to a subscriber</Dialog.Title>
            <p className="mt-1 text-sm text-gray-600">
              Each clinic takes its referral list, its campaigns and fax history, and its Your Sources entries. The
              referral-source catalog stays shared. Prospect decisions and activity stay with {options?.from.name ?? 'this organization'}.
            </p>

            {!options ? (
              <p className="mt-6 text-sm text-gray-500">Loading…</p>
            ) : (
              <div className="mt-5 space-y-5">
                <label className="block text-sm">
                  <span className="mb-1 block font-medium text-gray-700">Move to</span>
                  <select
                    value={to}
                    onChange={(event) => setTo(event.target.value)}
                    className="block w-full rounded-md border-gray-300 text-sm shadow-sm focus:border-green-500 focus:ring-green-500"
                  >
                    <option value="">Choose a subscriber…</option>
                    {options.organizations.map((organization) => (
                      <option key={organization.id} value={organization.id}>{organization.name}</option>
                    ))}
                  </select>
                  {options.organizations.length === 0 && (
                    <span className="mt-1 block text-xs text-amber-700">No subscribers yet. Add one under Paragon admin → Subscribers.</span>
                  )}
                </label>

                <fieldset>
                  <legend className="text-sm font-medium text-gray-700">Clinics</legend>
                  {options.clinics.length === 0 ? (
                    <p className="mt-1 text-sm text-gray-500">No clinics here.</p>
                  ) : (
                    <ul className="mt-2 divide-y divide-gray-100 rounded-md border border-gray-200">
                      {options.clinics.map((clinic) => (
                        <li key={clinic.id}>
                          <label className="flex cursor-pointer items-start gap-3 px-3 py-2 text-sm hover:bg-gray-50">
                            <input
                              type="checkbox"
                              className="mt-0.5 rounded border-gray-300 text-green-600 focus:ring-green-500"
                              checked={clinicIds.includes(clinic.id)}
                              onChange={() => setClinicIds((list) => toggle(list, clinic.id))}
                            />
                            <span>
                              <span className="font-medium text-gray-900">{clinic.name}</span>
                              {clinic.place && <span className="text-gray-500"> · {clinic.place}</span>}
                              <span className="block text-xs text-gray-500">
                                {plural(clinic.listed, 'practice')} on its list · {plural(clinic.campaigns, 'campaign')}
                              </span>
                            </span>
                          </label>
                        </li>
                      ))}
                    </ul>
                  )}
                </fieldset>

                {options.campaignsWithoutClinic.length > 0 && (
                  <fieldset>
                    <legend className="text-sm font-medium text-gray-700">Campaigns with no clinic</legend>
                    <p className="text-xs text-gray-500">Older campaigns picked referral sources directly. Choose the ones that belong to this subscriber.</p>
                    <ul className="mt-2 divide-y divide-gray-100 rounded-md border border-gray-200">
                      {options.campaignsWithoutClinic.map((campaign) => (
                        <li key={campaign.id}>
                          <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-gray-50">
                            <input
                              type="checkbox"
                              className="rounded border-gray-300 text-green-600 focus:ring-green-500"
                              checked={campaignIds.includes(campaign.id)}
                              onChange={() => setCampaignIds((list) => toggle(list, campaign.id))}
                            />
                            <span className="font-medium text-gray-900">{campaign.name}</span>
                            <span className="text-xs text-gray-500">
                              {campaign.status.toLowerCase()} · {new Date(campaign.createdAt).toLocaleDateString()}
                            </span>
                          </label>
                        </li>
                      ))}
                    </ul>
                  </fieldset>
                )}

                {problem && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{problem}</p>}
                {summary && target && (
                  <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-800">
                    Moves {summaryText(summary)} to <span className="font-medium">{target.name}</span>.
                  </p>
                )}
              </div>
            )}

            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={close} className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50">
                Cancel
              </button>
              <button
                type="button"
                onClick={move}
                disabled={!summary || moving}
                className="rounded-md bg-green-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-green-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {moving ? 'Moving…' : 'Move'}
              </button>
            </div>
          </Dialog.Panel>
        </div>
      </Dialog>
    </>
  );
}
