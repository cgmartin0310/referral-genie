'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { toast } from 'react-hot-toast';

interface FaxSettingsResponse {
  settings: {
    senderName: string;
    optOutPhone: string;
    optOutFax: string;
    suppressOptOut: boolean;
    consentAttestedAt: string | null;
    consentAttestedBy: string | null;
  };
  line: string | null;
  ready: boolean;
  problem: string | null;
}

/**
 * The sender, and the opt-out line printed on every campaign fax page. A
 * company with prior express permission from every practice it faxes can
 * leave the line off, after saying so.
 */
export default function FaxOptOutSettings() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['fax-settings'],
    queryFn: async () => (await axios.get<FaxSettingsResponse>('/api/fax-settings')).data,
  });
  const [values, setValues] = useState({ senderName: '', optOutPhone: '', optOutFax: '' });
  const [suppress, setSuppress] = useState(false);
  const [attested, setAttested] = useState(false);
  useEffect(() => {
    if (!data) return;
    setValues({ senderName: data.settings.senderName, optOutPhone: data.settings.optOutPhone, optOutFax: data.settings.optOutFax });
    setSuppress(data.settings.suppressOptOut);
    setAttested(false);
  }, [data]);

  const turningOff = suppress && !data?.settings.suppressOptOut;
  const save = useMutation({
    mutationFn: async () =>
      (await axios.put<FaxSettingsResponse>('/api/fax-settings', { ...values, suppressOptOut: suppress, consentAttested: attested })).data,
    onSuccess: (saved) => {
      queryClient.setQueryData(['fax-settings'], saved);
      queryClient.invalidateQueries({ queryKey: ['onboarding'] });
      toast.success(saved.ready ? 'Fax settings saved' : `Saved. ${saved.problem}`);
    },
    onError: (error: unknown) => {
      const message = axios.isAxiosError(error) ? error.response?.data?.error : null;
      toast.error(message || 'Could not save');
    },
  });

  const field = (key: keyof typeof values, label: string, placeholder: string) => (
    <div>
      <label htmlFor={`fax-${key}`} className="block text-sm font-medium text-gray-700">
        {label}
      </label>
      <input
        id={`fax-${key}`}
        value={values[key]}
        placeholder={placeholder}
        onChange={(event) => setValues((prev) => ({ ...prev, [key]: event.target.value }))}
        className="mt-1 block w-full rounded-md border-gray-300 text-sm shadow-sm focus:border-green-600 focus:ring-green-600"
      />
    </div>
  );

  return (
    <section className="mt-6 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
      <div className="border-b border-gray-200 px-5 py-4">
        <h2 className="text-base font-semibold text-gray-900">Fax opt-out line</h2>
        <p className="mt-1 max-w-3xl text-sm text-gray-600">
          Printed along the bottom of every page of every campaign fax, and on the cover sheet, unless you have permission
          from every practice you fax (below). Campaigns will not send until it is set up.
        </p>
      </div>
      {isLoading ? (
        <p className="px-5 py-8 text-center text-sm text-gray-500">Loading…</p>
      ) : (
        <div className="grid gap-4 px-5 py-4 sm:grid-cols-3">
          {field('senderName', 'Sender name', 'Boom Therapy Group')}
          {field('optOutPhone', `Opt-out phone (free to call)${suppress ? ', not printed' : ''}`, '(704) 240-3500')}
          {field('optOutFax', `Opt-out fax${suppress ? ', not printed' : ''}`, '(888) 555-0140')}

          <div className="sm:col-span-3 rounded-md border border-gray-200 px-4 py-3">
            <label className="flex items-start gap-3 text-sm text-gray-800">
              <input
                type="checkbox"
                checked={suppress}
                onChange={(event) => { setSuppress(event.target.checked); setAttested(false); }}
                className="mt-0.5 h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-600"
              />
              <span>
                <span className="font-medium">Don&rsquo;t print an opt-out line on our faxes</span>
                <span className="block text-gray-600">
                  For companies that have consent from every practice they fax, so the line doesn&rsquo;t make a
                  welcome fax look like spam. Practices that asked to stop still never get faxed.
                </span>
              </span>
            </label>
            {turningOff && (
              <label className="ml-7 mt-3 flex items-start gap-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
                <input
                  type="checkbox"
                  checked={attested}
                  onChange={(event) => setAttested(event.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-amber-400 text-green-600 focus:ring-green-600"
                />
                <span>
                  We have prior express permission to fax every practice we send to. We understand that faxing advertising
                  without that permission requires an opt-out notice.
                </span>
              </label>
            )}
            {suppress && !turningOff && data?.settings.consentAttestedAt && (
              <p className="ml-7 mt-2 text-xs text-gray-500">
                Permission confirmed {new Date(data.settings.consentAttestedAt).toLocaleDateString()}
                {data.settings.consentAttestedBy ? ` by ${data.settings.consentAttestedBy}` : ''}.
              </p>
            )}
          </div>

          <div className="sm:col-span-3">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Printed on each page</p>
            <p className="mt-1 rounded-md bg-gray-50 px-3 py-2 text-xs text-gray-700">
              {suppress
                ? 'Nothing: faxes go out without an opt-out line.'
                : data?.line ?? 'Fill in all three fields and save to see the line.'}
            </p>
          </div>
        </div>
      )}
      <div className="flex justify-end border-t border-gray-200 bg-gray-50 px-5 py-3">
        <button
          type="button"
          onClick={() => save.mutate()}
          disabled={save.isPending || isLoading || (turningOff && !attested)}
          className="rounded-md bg-green-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-green-500 disabled:cursor-not-allowed disabled:bg-gray-300"
        >
          {save.isPending ? 'Saving…' : 'Save'}
        </button>
      </div>
    </section>
  );
}
