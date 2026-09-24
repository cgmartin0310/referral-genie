'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { toast } from 'react-hot-toast';

interface Group {
  group: string;
  label: string;
  organizations: boolean;
  enabled: boolean;
  codes: { code: string; description: string }[];
  onFile: number;
}

/** Paragon picks the specialties the shared county catalog pulls. */
export default function CatalogSpecialtySettings() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['catalog-settings'],
    queryFn: async () => (await axios.get<{ groups: Group[] }>('/api/catalog-settings')).data,
  });
  const [on, setOn] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (data) setOn(new Set(data.groups.filter((row) => row.enabled).map((row) => row.group)));
  }, [data]);

  const save = useMutation({
    mutationFn: async () => (await axios.put<{ groups: Group[] }>('/api/catalog-settings', { groups: [...on] })).data,
    onSuccess: (saved) => {
      queryClient.setQueryData(['catalog-settings'], saved);
      queryClient.invalidateQueries({ queryKey: ['estimate-rates'] });
      toast.success('Saved. Pull a county again to add or drop these specialties there.');
    },
    onError: () => toast.error('Could not save'),
  });

  const missingOnFile = (data?.groups ?? []).filter((row) => on.has(row.group) && row.onFile === 0);

  return (
    <section className="mt-6 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
      <div className="border-b border-gray-200 px-5 py-4">
        <h2 className="text-base font-semibold text-gray-900">Specialties in the catalog</h2>
        <p className="mt-1 max-w-3xl text-sm text-gray-600">
          Which referring specialties a county pull adds to the shared catalog, from the NPI taxonomy codes listed under
          each. Paragon only. Pull a county again after a change.
        </p>
      </div>
      {isLoading || !data ? (
        <p className="px-5 py-8 text-center text-sm text-gray-500">Loading…</p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {data.groups.map((row) => (
            <li key={row.group} className="flex items-start gap-3 px-5 py-3">
              <input
                id={`specialty-${row.group}`}
                type="checkbox"
                checked={on.has(row.group)}
                onChange={(event) =>
                  setOn((prev) => {
                    const next = new Set(prev);
                    if (event.target.checked) next.add(row.group);
                    else next.delete(row.group);
                    return next;
                  })
                }
                className="mt-1 h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-600"
              />
              <label htmlFor={`specialty-${row.group}`} className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-gray-900">{row.label}</span>
                <span className="block text-xs text-gray-500">
                  {row.codes.map((code) => `${code.description} (${code.code})`).join(' · ')}
                </span>
              </label>
              <span className="whitespace-nowrap text-xs text-gray-500">{row.onFile.toLocaleString()} on NPI file</span>
            </li>
          ))}
        </ul>
      )}
      {missingOnFile.length > 0 && (
        <p className="border-t border-amber-200 bg-amber-50 px-5 py-3 text-sm text-amber-800">
          The NPI file was loaded before {missingOnFile.map((row) => row.label).join(', ')} could be pulled. Reload it on
          Render (<code>npm run npi:load -- --states NC</code>) before pulling a county.
        </p>
      )}
      <div className="flex justify-end border-t border-gray-200 bg-gray-50 px-5 py-3">
        <button
          type="button"
          onClick={() => save.mutate()}
          disabled={save.isPending || isLoading || on.size === 0}
          className="rounded-md bg-green-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-green-500 disabled:cursor-not-allowed disabled:bg-gray-300"
        >
          {save.isPending ? 'Saving…' : 'Save'}
        </button>
      </div>
    </section>
  );
}
