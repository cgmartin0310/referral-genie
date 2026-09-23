'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { toast } from 'react-hot-toast';

interface FaxSettingsResponse {
  settings: { senderName: string; optOutPhone: string; optOutFax: string };
  line: string | null;
}

/** Sender and opt-out numbers for the line printed on every campaign fax page. */
export default function FaxOptOutSettings() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['fax-settings'],
    queryFn: async () => (await axios.get<FaxSettingsResponse>('/api/fax-settings')).data,
  });
  const [values, setValues] = useState({ senderName: '', optOutPhone: '', optOutFax: '' });
  useEffect(() => {
    if (data) setValues(data.settings);
  }, [data]);

  const save = useMutation({
    mutationFn: async () => (await axios.put<FaxSettingsResponse>('/api/fax-settings', values)).data,
    onSuccess: (saved) => {
      queryClient.setQueryData(['fax-settings'], saved);
      toast.success(saved.line ? 'Opt-out line saved' : 'Saved. Fill in all three fields before sending faxes.');
    },
    onError: () => toast.error('Could not save'),
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
          Printed along the bottom of every page of every campaign fax, and on the cover sheet. Campaigns will not send
          until all three are filled in.
        </p>
      </div>
      {isLoading ? (
        <p className="px-5 py-8 text-center text-sm text-gray-500">Loading…</p>
      ) : (
        <div className="grid gap-4 px-5 py-4 sm:grid-cols-3">
          {field('senderName', 'Sender name', 'Boom Therapy Group')}
          {field('optOutPhone', 'Opt-out phone (free to call)', '(704) 240-3500')}
          {field('optOutFax', 'Opt-out fax', '(888) 555-0140')}
          <div className="sm:col-span-3">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Printed on each page</p>
            <p className="mt-1 rounded-md bg-gray-50 px-3 py-2 text-xs text-gray-700">
              {data?.line ?? 'Fill in all three fields and save to see the line.'}
            </p>
          </div>
        </div>
      )}
      <div className="flex justify-end border-t border-gray-200 bg-gray-50 px-5 py-3">
        <button
          type="button"
          onClick={() => save.mutate()}
          disabled={save.isPending || isLoading}
          className="rounded-md bg-green-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-green-500 disabled:cursor-not-allowed disabled:bg-gray-300"
        >
          {save.isPending ? 'Saving…' : 'Save'}
        </button>
      </div>
    </section>
  );
}
