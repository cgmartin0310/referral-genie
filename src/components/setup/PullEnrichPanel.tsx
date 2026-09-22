'use client';

import { useEffect, useState } from 'react';
import axios from 'axios';
import Link from 'next/link';
import { toast } from 'react-hot-toast';
import type { MarketCountyView } from '@/lib/geo/market-view';

interface PublicSummary {
  npisUpserted: number;
  npisCreated: number;
  npisUpdated: number;
  placesMatched: number;
  placesUnmatched: number;
  quarantined: number;
  duplicatesFlagged: number;
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

interface CountyJob {
  run: CountyRun | null;
  placesPending: number;
  loading: boolean;
  working: 'pull' | 'enrich' | null;
}

const PHASE_LABEL: Record<string, string> = {
  nppes: 'Pulling referral sources',
  places: 'Enriching with Google Places',
  duplicates: 'Checking duplicates',
  done: 'Finished',
};

const emptyJob = (): CountyJob => ({ run: null, placesPending: 0, loading: true, working: null });

function pullMode(run: CountyRun | null): { mode: 'continue' | 'refresh'; runId?: string } {
  if (run && run.status !== 'COMPLETED' && run.phase === 'nppes') {
    return { mode: 'continue', runId: run.id };
  }
  return { mode: 'refresh' };
}

function canEnrich(run: CountyRun | null): boolean {
  return !!run && run.status !== 'COMPLETED' && (run.phase === 'places' || run.phase === 'duplicates');
}

function pullLabel(job: CountyJob): string {
  if (job.working === 'pull') return 'Pulling…';
  const run = job.run;
  if (!run || run.status === 'COMPLETED' || run.phase !== 'nppes') {
    return run ? 'Pull again' : 'Pull referral sources';
  }
  if (run.status === 'FAILED') return 'Resume pull';
  return 'Continue pull';
}

function enrichLabel(job: CountyJob): string {
  if (job.working === 'enrich') return 'Enriching…';
  const run = job.run;
  if (run?.status === 'COMPLETED') return 'Places enriched';
  if (run?.status === 'FAILED' && canEnrich(run)) return 'Resume enrichment';
  if (run && run.phase === 'duplicates') return 'Continue enrichment';
  return 'Enrich with Google Places';
}

export default function PullEnrichPanel({
  counties,
  clinicId,
  onProgress,
}: {
  counties: MarketCountyView[];
  /** When set, NPI upserts stamp ReferralSource.clinicLocationId to this clinic. */
  clinicId?: string;
  onProgress?: (progress: { anyPastNppes: boolean; anyCompleted: boolean }) => void;
}) {
  const ready = counties.filter((county) => county.pullReady && county.seedCountyId);
  const waiting = counties.filter((county) => !county.pullReady);
  const [jobs, setJobs] = useState<Record<string, CountyJob>>({});

  useEffect(() => {
    let cancelled = false;
    if (ready.length === 0) {
      setJobs({});
      onProgress?.({ anyPastNppes: false, anyCompleted: false });
      return;
    }

    setJobs(Object.fromEntries(ready.map((county) => [county.seedCountyId as string, emptyJob()])));
    Promise.all(
      ready.map(async (county) => {
        const seedCountyId = county.seedCountyId as string;
        const { data } = await axios.get('/api/county-seed', { params: { countyId: seedCountyId } });
        return [seedCountyId, { run: data.latestRun, placesPending: data.placesPending ?? 0, loading: false, working: null }] as const;
      }),
    )
      .then((rows) => {
        if (cancelled) return;
        const next = Object.fromEntries(rows);
        setJobs(next);
        const runs = rows.map(([, job]) => job.run).filter((run): run is CountyRun => !!run);
        onProgress?.({
          anyPastNppes: runs.some((run) => run.phase !== 'nppes'),
          anyCompleted: runs.some((run) => run.status === 'COMPLETED'),
        });
      })
      .catch(() => {
        if (cancelled) return;
        toast.error('Failed to load the referral source pull');
        setJobs((current) => {
          const next: Record<string, CountyJob> = {};
          for (const [key, job] of Object.entries(current)) {
            next[key] = { ...job, loading: false };
          }
          return next;
        });
      });

    return () => {
      cancelled = true;
    };
    // Reload when the saved market changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready.map((county) => county.fips).join('|')]);

  const patchJob = (seedCountyId: string, patch: Partial<CountyJob>) => {
    setJobs((current) => ({
      ...current,
      [seedCountyId]: { ...(current[seedCountyId] ?? emptyJob()), ...patch },
    }));
  };

  const report = (nextJobs: Record<string, CountyJob>) => {
    const runs = Object.values(nextJobs)
      .map((job) => job.run)
      .filter((run): run is CountyRun => !!run);
    onProgress?.({
      anyPastNppes: runs.some((run) => run.phase !== 'nppes'),
      anyCompleted: runs.some((run) => run.status === 'COMPLETED'),
    });
  };

  const runJob = async (county: MarketCountyView, action: 'pull' | 'enrich') => {
    const seedCountyId = county.seedCountyId;
    if (!seedCountyId) return;
    const current = jobs[seedCountyId] ?? emptyJob();
    if (action === 'enrich' && !canEnrich(current.run)) return;

    patchJob(seedCountyId, { working: action });
    const start = action === 'pull' ? pullMode(current.run) : { mode: 'continue' as const, runId: current.run?.id };
    let runId = start.runId;
    let mode = start.mode;
    try {
      for (let step = 0; step < 500; step += 1) {
        const { data } = await axios.post('/api/county-seed', {
          countyId: seedCountyId,
          runId,
          mode,
          ...(clinicId ? { clinicLocationId: clinicId } : {}),
        });
        const run = data.run as CountyRun;
        const placesPending = data.placesPending ?? 0;
        setJobs((prev) => {
          const next = {
            ...prev,
            [seedCountyId]: { run, placesPending, loading: false, working: action },
          };
          queueMicrotask(() => report(next));
          return next;
        });
        runId = run.id;
        mode = 'continue';
        if (data.busy) {
          toast('A pull step is still running. Press the button again in a moment.');
          break;
        }
        if (run.status === 'FAILED') {
          toast.error(run.error || 'Referral source pull failed');
          break;
        }
        if (action === 'pull' && run.phase !== 'nppes') {
          toast.success(`Referral sources pulled for ${county.name}. Enrich with Google Places when you are ready.`);
          break;
        }
        if (action === 'enrich' && run.status === 'COMPLETED') {
          toast.success(`Google Places enrichment finished for ${county.name}.`);
          break;
        }
      }
    } catch (error) {
      const message = axios.isAxiosError(error)
        ? error.response?.data?.error || 'Referral source pull failed'
        : 'Referral source pull failed';
      toast.error(message);
    } finally {
      patchJob(seedCountyId, { working: null });
    }
  };

  if (counties.length === 0) {
    return (
      <section id="sources" className="bg-white shadow rounded-lg p-6">
        <h2 className="text-lg font-medium text-gray-900">Pull referral sources</h2>
        <p className="mt-2 text-sm text-gray-600">Save this clinic&apos;s counties before pulling referral sources.</p>
      </section>
    );
  }

  return (
    <section id="sources" className="space-y-4">
      <div>
        <h2 className="text-lg font-medium text-gray-900">Pull referral sources, then enrich</h2>
        <p className="mt-1 text-sm text-gray-600">
          Pull pediatricians and primary care physicians from NPPES for this clinic&apos;s counties, then match phone
          and address to Google Places. Pulled sources are linked to this clinic so they show under Referral Sources.
          Keyword search for partners without an NPI stays on{' '}
          <Link href="/prospecting" className="text-indigo-600 hover:text-indigo-500">
            Non-NPI search
          </Link>
          .
        </p>
      </div>

      {waiting.map((county) => (
        <div key={county.fips} className="bg-white shadow rounded-lg p-6">
          <h3 className="text-base font-medium text-gray-900">
            {county.name}, {county.state}
          </h3>
          <p className="mt-2 text-sm text-gray-600">
            Saved on this clinic&apos;s market. The NPI pull needs a practice-location ZIP list, and this county does not
            have one yet.
          </p>
        </div>
      ))}

      {ready.map((county) => {
        const seedCountyId = county.seedCountyId as string;
        const job = jobs[seedCountyId] ?? emptyJob();
        const summary = job.run?.summary;
        const enrichReady = canEnrich(job.run);
        const enrichPrimary = job.working === 'enrich' || (enrichReady && job.working === null && !job.loading);
        return (
          <div key={county.fips} className="bg-white shadow rounded-lg p-6">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h3 className="text-base font-medium text-gray-900">
                {county.name}, {county.state}
              </h3>
              {job.run && (
                <p className="text-sm text-gray-500">
                  {PHASE_LABEL[job.run.phase] ?? job.run.phase} · {job.run.status}
                </p>
              )}
            </div>
            <div className="mt-4 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => runJob(county, 'pull')}
                disabled={job.working !== null || job.loading}
                className={
                  enrichPrimary
                    ? 'inline-flex items-center rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 disabled:text-gray-400'
                    : 'inline-flex items-center rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:bg-indigo-300'
                }
              >
                {job.loading ? 'Loading…' : pullLabel(job)}
              </button>
              <button
                type="button"
                onClick={() => runJob(county, 'enrich')}
                disabled={job.working !== null || job.loading || !enrichReady}
                className={
                  enrichPrimary
                    ? 'inline-flex items-center rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:bg-indigo-300'
                    : 'inline-flex items-center rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-400 shadow-sm ring-1 ring-inset ring-gray-300'
                }
              >
                {enrichLabel(job)}
              </button>
            </div>
            {!job.run || job.run.phase === 'nppes' ? (
              <p className="mt-3 text-xs text-gray-500">Pull referral sources before enriching with Google Places.</p>
            ) : null}
            {summary && (
              <>
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
                  NPPES queries {summary.nppesQueries} / {summary.nppesQueryTotal}. Quarantined (not sent to Places){' '}
                  {summary.quarantined}. Created {summary.npisCreated}, updated {summary.npisUpdated}.
                  {job.run?.phase === 'places' ? ` Places still pending: ${job.placesPending}.` : ''}
                  {summary.truncatedQueries > 0 ? ` Truncated NPPES queries: ${summary.truncatedQueries}.` : ''}
                </p>
                {job.run?.error && <p className="mt-3 text-sm text-red-700">{job.run.error}</p>}
                {summary.nppesErrors.length > 0 && (
                  <ul className="mt-3 list-disc pl-5 text-sm text-amber-800">
                    {summary.nppesErrors.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>
        );
      })}

      <p className="text-sm">
        <Link href="/referral-sources" className="text-indigo-600 hover:text-indigo-500">
          View referral sources
        </Link>
      </p>
    </section>
  );
}
