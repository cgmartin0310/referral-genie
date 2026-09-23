'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { toast } from 'react-hot-toast';
import { PlusIcon, XMarkIcon } from '@heroicons/react/24/outline';
import MainLayout from '@/components/layout/MainLayout';
import type { EstimateRates } from '@/lib/practices/estimate';

interface RatesResponse {
  settings: EstimateRates;
  providerTypes: { sourceType: string; label: string }[];
  defaults: EstimateRates;
}

/** A rate table being edited: numbers kept as text so a half-typed "0." survives. */
interface Draft {
  disciplines: { key: string; label: string }[];
  rates: Record<string, Record<string, string>>;
}

function toDraft(settings: EstimateRates): Draft {
  const rates: Draft['rates'] = {};
  for (const discipline of settings.disciplines) {
    rates[discipline.key] = {};
    for (const [sourceType, value] of Object.entries(settings.rates[discipline.key] ?? {})) {
      rates[discipline.key][sourceType] = String(value);
    }
  }
  return { disciplines: settings.disciplines.map((row) => ({ ...row })), rates };
}

function fromDraft(draft: Draft): EstimateRates {
  const rates: EstimateRates['rates'] = {};
  for (const discipline of draft.disciplines) {
    rates[discipline.key] = {};
    for (const [sourceType, value] of Object.entries(draft.rates[discipline.key] ?? {})) {
      const number = Number(value);
      rates[discipline.key][sourceType] = Number.isFinite(number) ? number : 0;
    }
  }
  return { disciplines: draft.disciplines, rates };
}

function newKey(draft: Draft): string {
  let index = draft.disciplines.length + 1;
  while (draft.disciplines.some((row) => row.key === `discipline_${index}`)) index += 1;
  return `discipline_${index}`;
}

function formatRate(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0$/, '');
}

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['estimate-rates'],
    queryFn: async () => (await axios.get<RatesResponse>('/api/estimate-rates')).data,
  });
  const [draft, setDraft] = useState<Draft | null>(null);
  useEffect(() => {
    if (data) setDraft(toDraft(data.settings));
  }, [data]);

  const save = useMutation({
    mutationFn: async (value: Draft) => (await axios.put<RatesResponse>('/api/estimate-rates', fromDraft(value))).data,
    onSuccess: (saved) => {
      queryClient.setQueryData(['estimate-rates'], saved);
      queryClient.invalidateQueries({ queryKey: ['practices'] });
      queryClient.invalidateQueries({ queryKey: ['clinic-locations'] });
      toast.success('Referral estimates updated');
    },
    onError: () => toast.error('Could not save the rates'),
  });

  const providerTypes = data?.providerTypes ?? [];
  const totals = useMemo(() => {
    const out: Record<string, number> = {};
    if (!draft) return out;
    for (const { sourceType } of providerTypes) {
      out[sourceType] = draft.disciplines.reduce((sum, discipline) => {
        const number = Number(draft.rates[discipline.key]?.[sourceType] ?? 0);
        return sum + (Number.isFinite(number) && number > 0 ? number : 0);
      }, 0);
    }
    return out;
  }, [draft, providerTypes]);

  const setRate = (discipline: string, sourceType: string, value: string) =>
    setDraft((prev) =>
      prev ? { ...prev, rates: { ...prev.rates, [discipline]: { ...prev.rates[discipline], [sourceType]: value } } } : prev,
    );
  const setLabel = (key: string, label: string) =>
    setDraft((prev) => (prev ? { ...prev, disciplines: prev.disciplines.map((row) => (row.key === key ? { ...row, label } : row)) } : prev));
  const addDiscipline = () =>
    setDraft((prev) => {
      if (!prev) return prev;
      const key = newKey(prev);
      return { disciplines: [...prev.disciplines, { key, label: '' }], rates: { ...prev.rates, [key]: {} } };
    });
  const removeDiscipline = (key: string) =>
    setDraft((prev) => {
      if (!prev) return prev;
      const rates = { ...prev.rates };
      delete rates[key];
      return { disciplines: prev.disciplines.filter((row) => row.key !== key), rates };
    });

  const unnamed = draft?.disciplines.some((row) => !row.label.trim()) ?? false;
  const empty = (draft?.disciplines.length ?? 0) === 0;

  return (
    <MainLayout>
      <h1 className="text-2xl font-semibold tracking-tight text-gray-900">Settings</h1>

      <section className="mt-6 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-200 px-5 py-4">
          <h2 className="text-base font-semibold text-gray-900">Referral estimates</h2>
          <p className="mt-1 max-w-3xl text-sm text-gray-600">
            How many referrals one provider of each type sends a month, for each therapy discipline. Every estimate in
            Referral Genie adds these up over a practice&rsquo;s providers and shows the result as a range.
          </p>
        </div>

        {isLoading || !draft ? (
          <p className="px-5 py-10 text-center text-sm text-gray-500">Loading…</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th scope="col" className="px-5 py-3 text-left font-semibold text-gray-700">
                    Provider type
                  </th>
                  {draft.disciplines.map((discipline) => (
                    <th key={discipline.key} scope="col" className="px-3 py-2 text-left font-semibold text-gray-700">
                      <div className="flex items-center gap-1">
                        <input
                          value={discipline.label}
                          onChange={(event) => setLabel(discipline.key, event.target.value)}
                          placeholder="Discipline name"
                          aria-label="Discipline name"
                          maxLength={40}
                          className="w-40 rounded-md border-gray-300 text-sm font-semibold focus:border-green-600 focus:ring-green-600"
                        />
                        <button
                          type="button"
                          onClick={() => removeDiscipline(discipline.key)}
                          className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-red-600"
                          aria-label={`Remove ${discipline.label || 'discipline'}`}
                          title="Remove this discipline"
                        >
                          <XMarkIcon className="h-4 w-4" />
                        </button>
                      </div>
                    </th>
                  ))}
                  <th scope="col" className="px-5 py-3 text-right font-semibold text-gray-700">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {providerTypes.map((type) => (
                  <tr key={type.sourceType}>
                    <th scope="row" className="whitespace-nowrap px-5 py-3 text-left font-medium text-gray-900">
                      {type.label}
                    </th>
                    {draft.disciplines.map((discipline) => (
                      <td key={discipline.key} className="px-3 py-2">
                        <input
                          type="number"
                          inputMode="decimal"
                          min={0}
                          max={20}
                          step={0.05}
                          value={draft.rates[discipline.key]?.[type.sourceType] ?? '0'}
                          onChange={(event) => setRate(discipline.key, type.sourceType, event.target.value)}
                          aria-label={`${type.label}, ${discipline.label || 'discipline'}: referrals per provider per month`}
                          className="w-24 rounded-md border-gray-300 text-sm focus:border-green-600 focus:ring-green-600"
                        />
                      </td>
                    ))}
                    <td className="whitespace-nowrap px-5 py-3 text-right text-gray-700">
                      {formatRate(totals[type.sourceType] ?? 0)} / mo
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-200 bg-gray-50 px-5 py-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={addDiscipline}
              disabled={!draft || draft.disciplines.length >= 10}
              className="inline-flex items-center gap-1 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50"
            >
              <PlusIcon className="h-4 w-4" />
              Add discipline
            </button>
            <button
              type="button"
              onClick={() => data && setDraft(toDraft(data.defaults))}
              disabled={!data}
              className="rounded-md px-3 py-2 text-sm font-medium text-gray-600 hover:text-gray-900"
            >
              Reset to defaults
            </button>
          </div>
          <div className="flex items-center gap-3">
            {(unnamed || empty) && (
              <span className="text-sm text-amber-700">{empty ? 'Add at least one discipline.' : 'Name every discipline.'}</span>
            )}
            <button
              type="button"
              onClick={() => draft && save.mutate(draft)}
              disabled={!draft || unnamed || empty || save.isPending}
              className="rounded-md bg-green-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-green-500 disabled:cursor-not-allowed disabled:bg-gray-300"
            >
              {save.isPending ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </section>
    </MainLayout>
  );
}
