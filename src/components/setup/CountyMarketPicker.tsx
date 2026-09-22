'use client';

import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { toast } from 'react-hot-toast';
import type { MarketCountyView } from '@/lib/geo/market-view';

interface StateOption {
  code: string;
  name: string;
}

const LENOIR_EXAMPLE: MarketCountyView = {
  fips: '37107',
  name: 'Lenoir County',
  state: 'NC',
  pullReady: true,
  seedCountyId: 'lenoir-nc',
};

function sameMarket(left: MarketCountyView[], right: MarketCountyView[]): boolean {
  const key = (counties: MarketCountyView[]) =>
    counties
      .map((county) => county.fips)
      .sort()
      .join(',');
  return key(left) === key(right);
}

export default function CountyMarketPicker({
  clinicId,
  saved,
  onSaved,
}: {
  clinicId: string;
  saved: MarketCountyView[];
  onSaved: (counties: MarketCountyView[]) => void;
}) {
  const [states, setStates] = useState<StateOption[]>([]);
  const [stateCode, setStateCode] = useState('');
  const [query, setQuery] = useState('');
  const [options, setOptions] = useState<MarketCountyView[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [selected, setSelected] = useState<MarketCountyView[]>(saved);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setSelected(saved);
  }, [saved]);

  useEffect(() => {
    let cancelled = false;
    axios
      .get('/api/counties')
      .then(({ data }) => {
        if (!cancelled) setStates(data.states ?? []);
      })
      .catch(() => {
        if (!cancelled) toast.error('Failed to load states');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!stateCode) {
      setOptions([]);
      return;
    }
    let cancelled = false;
    setLoadingOptions(true);
    axios
      .get('/api/counties', { params: { state: stateCode } })
      .then(({ data }) => {
        if (!cancelled) setOptions(data.counties ?? []);
      })
      .catch(() => {
        if (!cancelled) toast.error('Failed to load counties');
      })
      .finally(() => {
        if (!cancelled) setLoadingOptions(false);
      });
    return () => {
      cancelled = true;
    };
  }, [stateCode]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return options;
    return options.filter((county) => county.name.toLowerCase().includes(needle));
  }, [options, query]);

  const dirty = !sameMarket(selected, saved);

  const toggle = (county: MarketCountyView) => {
    setSelected((current) => {
      if (current.some((item) => item.fips === county.fips)) {
        return current.filter((item) => item.fips !== county.fips);
      }
      if (current.length >= 40) {
        toast.error('Choose 40 counties or fewer');
        return current;
      }
      return [...current, county].sort((a, b) => a.state.localeCompare(b.state) || a.name.localeCompare(b.name));
    });
  };

  const addExample = () => {
    setStateCode('NC');
    setQuery('Lenoir');
    setSelected((current) => {
      if (current.some((item) => item.fips === LENOIR_EXAMPLE.fips)) return current;
      return [...current, LENOIR_EXAMPLE].sort((a, b) => a.state.localeCompare(b.state) || a.name.localeCompare(b.name));
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      const { data } = await axios.put(`/api/clinic-locations/${clinicId}/market`, {
        fips: selected.map((county) => county.fips),
      });
      const counties = (data.counties ?? []) as MarketCountyView[];
      setSelected(counties);
      onSaved(counties);
      toast.success(counties.length === 0 ? 'Market cleared' : 'Market saved');
    } catch (error) {
      const message = axios.isAxiosError(error)
        ? error.response?.data?.error || 'Failed to save the market'
        : 'Failed to save the market';
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section id="market" className="bg-white shadow rounded-lg p-6">
      <h2 className="text-lg font-medium text-gray-900">Pick counties</h2>
      <p className="mt-1 text-sm text-gray-600">
        Choose one or more US counties as this clinic&apos;s market. Search by state, then county name.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={addExample}
          className="inline-flex items-center rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
        >
          Add example: Lenoir County, NC
        </button>
        <p className="text-xs text-gray-500">Lenoir County, NC is an example. Any other county can be saved too.</p>
      </div>

      {selected.length > 0 && (
        <ul className="mt-4 flex flex-wrap gap-2">
          {selected.map((county) => (
            <li key={county.fips}>
              <button
                type="button"
                onClick={() => toggle(county)}
                className="inline-flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-1 text-sm text-indigo-800 hover:bg-indigo-100"
              >
                {county.name}, {county.state}
                <span className="text-xs text-indigo-500">{county.pullReady ? 'Ready to pull' : 'Saved'}</span>
                <span className="sr-only">Remove</span>
                <span aria-hidden="true">×</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="market-state" className="block text-sm font-medium text-gray-700">
            State
          </label>
          <select
            id="market-state"
            value={stateCode}
            onChange={(event) => {
              setStateCode(event.target.value);
              setQuery('');
            }}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
          >
            <option value="">Select a state</option>
            {states.map((state) => (
              <option key={state.code} value={state.code}>
                {state.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="market-search" className="block text-sm font-medium text-gray-700">
            County
          </label>
          <input
            id="market-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            disabled={!stateCode}
            placeholder={stateCode ? 'Search counties' : 'Select a state first'}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm disabled:bg-gray-50"
          />
        </div>
      </div>

      <div className="mt-4 max-h-64 overflow-y-auto rounded-md border border-gray-200">
        {!stateCode ? (
          <p className="px-3 py-6 text-sm text-gray-500">Select a state to see its counties.</p>
        ) : loadingOptions ? (
          <p className="px-3 py-6 text-sm text-gray-500">Loading counties…</p>
        ) : visible.length === 0 ? (
          <p className="px-3 py-6 text-sm text-gray-500">No counties match that search.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {visible.map((county) => {
              const checked = selected.some((item) => item.fips === county.fips);
              return (
                <li key={county.fips}>
                  <label className="flex cursor-pointer items-center justify-between gap-3 px-3 py-2 hover:bg-gray-50">
                    <span className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggle(county)}
                        className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <span className="text-sm text-gray-900">{county.name}</span>
                    </span>
                    {county.pullReady && (
                      <span className="text-xs font-medium text-green-700">Ready to pull</span>
                    )}
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={saving || !dirty}
          className="inline-flex items-center rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:bg-indigo-300"
        >
          {saving ? 'Saving…' : 'Save market'}
        </button>
        {dirty && <p className="text-sm text-gray-500">Unsaved county changes.</p>}
      </div>
    </section>
  );
}
