'use client';

import { useEffect, useState } from 'react';
import axios from 'axios';
import Link from 'next/link';
import { toast } from 'react-hot-toast';
import MainLayout from '../../components/layout/MainLayout';

interface PublicSummary {
  npisUpserted: number;
  npisCreated: number;
  npisUpdated: number;
  placesMatched: number;
  placesUnmatched: number;
  quarantined: number;
  duplicatesFlagged: number;
  duplicateClusters: number;
  nppesQueries: number;
  nppesQueryTotal: number;
  truncatedQueries: number;
  nppesErrors: string[];
}

interface CountyRun {
  id: string;
  countyId: string;
  countyName: string;
  countyFips: string;
  status: string;
  phase: string;
  error: string | null;
  summary: PublicSummary;
}

interface CountyOption {
  id: string;
  name: string;
  state: string;
  fips: string;
  zipCount: number;
}

const PHASE_LABEL: Record<string, string> = {
  nppes: 'Reading NPPES',
  places: 'Matching Google Places',
  duplicates: 'Flagging duplicates',
  done: 'Finished',
};

function buttonLabel(run: CountyRun | null, working: boolean): string {
  if (working) return 'Seeding…';
  if (!run || run.status === 'COMPLETED') return 'Seed / refresh county';
  if (run.status === 'FAILED') return 'Resume seed';
  return 'Continue seed';
}

export default function CountySeedPage() {
  const [counties, setCounties] = useState<CountyOption[]>([]);
  const [countyId, setCountyId] = useState('lenoir-nc');
  const [taxonomyCount, setTaxonomyCount] = useState(9);
  const [run, setRun] = useState<CountyRun | null>(null);
  const [placesPending, setPlacesPending] = useState(0);
  const [working, setWorking] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const { data } = await axios.get('/api/county-seed', { params: { countyId } });
        if (cancelled) return;
        setCounties(data.counties);
        setTaxonomyCount(data.taxonomyCount);
        setRun(data.latestRun);
        setPlacesPending(data.placesPending ?? 0);
      } catch (error) {
        console.error(error);
        if (!cancelled) toast.error('Failed to load county seed');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [countyId]);

  const seed = async () => {
    setWorking(true);
    let runId = run && run.status !== 'COMPLETED' ? run.id : undefined;
    let mode: 'continue' | 'refresh' = run && run.status !== 'COMPLETED' ? 'continue' : 'refresh';
    try {
      for (let step = 0; step < 500; step += 1) {
        const { data } = await axios.post('/api/county-seed', { countyId, runId, mode });
        setRun(data.run);
        setPlacesPending(data.placesPending ?? 0);
        runId = data.run.id;
        mode = 'continue';
        if (data.busy) {
          toast('A seed step is still running. Press the button again in a moment.');
          break;
        }
        if (data.run.status === 'COMPLETED') {
          toast.success('County seed finished');
          break;
        }
        if (data.run.status === 'FAILED') {
          toast.error(data.run.error || 'County seed failed');
          break;
        }
      }
    } catch (error) {
      console.error(error);
      const message = axios.isAxiosError(error)
        ? error.response?.data?.error || 'County seed failed'
        : 'County seed failed';
      toast.error(message);
    } finally {
      setWorking(false);
    }
  };

  const summary = run?.summary;

  return (
    <MainLayout>
      <div className="max-w-3xl">
        <h1 className="text-2xl font-semibold text-gray-900">Seed county</h1>
        <p className="mt-2 text-sm text-gray-600">
          Load pediatricians and primary care physicians from NPPES for one county, then match
          each practice address or phone to Google Places. This is the source list for the Kinston
          pilot. Keyword search stays under Non-NPI search for partners that do not have an NPI.
        </p>

        <div className="mt-6 bg-white shadow rounded-lg p-6 space-y-4">
          <div>
            <label htmlFor="county" className="block text-sm font-medium text-gray-700">
              County
            </label>
            <select
              id="county"
              value={countyId}
              onChange={(event) => setCountyId(event.target.value)}
              disabled={working}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
            >
              {(counties.length > 0 ? counties : [{ id: 'lenoir-nc', name: 'Lenoir County', state: 'NC', fips: '37107', zipCount: 8 }]).map((county) => (
                <option key={county.id} value={county.id}>
                  {county.name}, {county.state} (FIPS {county.fips})
                </option>
              ))}
            </select>
            <p className="mt-2 text-xs text-gray-500">
              Default market is Lenoir County, NC (Kinston). {taxonomyCount} NUCC codes: pediatrics,
              family medicine, internal medicine, and general practice. Re-running upserts by NPI
              and keeps fields you edited.
            </p>
          </div>

          <button
            type="button"
            onClick={seed}
            disabled={working || loading}
            className="inline-flex items-center rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:bg-indigo-300"
          >
            {buttonLabel(run, working)}
          </button>
        </div>

        {run && summary && (
          <div className="mt-6 bg-white shadow rounded-lg p-6">
            <div className="flex items-baseline justify-between gap-4">
              <h2 className="text-lg font-medium text-gray-900">{run.countyName}</h2>
              <p className="text-sm text-gray-500">
                {PHASE_LABEL[run.phase] ?? run.phase} · {run.status}
              </p>
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">NPIs upserted</dt>
                <dd className="mt-1 text-2xl font-semibold text-gray-900">{summary.npisUpserted}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">Places matched</dt>
                <dd className="mt-1 text-2xl font-semibold text-gray-900">{summary.placesMatched}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">Unmatched</dt>
                <dd className="mt-1 text-2xl font-semibold text-gray-900">{summary.placesUnmatched}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">Duplicates flagged</dt>
                <dd className="mt-1 text-2xl font-semibold text-gray-900">{summary.duplicatesFlagged}</dd>
              </div>
            </dl>
            <p className="mt-4 text-sm text-gray-600">
              NPPES queries {summary.nppesQueries} / {summary.nppesQueryTotal}. Quarantined (not sent
              to Places) {summary.quarantined}. Created {summary.npisCreated}, updated {summary.npisUpdated}.
              {run.phase === 'places' ? ` Places still pending: ${placesPending}.` : ''}
              {summary.truncatedQueries > 0 ? ` Truncated NPPES queries: ${summary.truncatedQueries}.` : ''}
            </p>
            {run.error && (
              <p className="mt-3 text-sm text-red-700">{run.error}</p>
            )}
            {summary.nppesErrors.length > 0 && (
              <ul className="mt-3 list-disc pl-5 text-sm text-amber-800">
                {summary.nppesErrors.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            )}
            <p className="mt-4 text-sm">
              <Link href="/referral-sources" className="text-indigo-600 hover:text-indigo-500">
                View referral sources
              </Link>
            </p>
          </div>
        )}
      </div>
    </MainLayout>
  );
}
