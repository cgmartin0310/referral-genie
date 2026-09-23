'use client';

import { useCallback, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { toast } from 'react-hot-toast';
import { CheckCircleIcon, ExclamationCircleIcon, MinusCircleIcon } from '@heroicons/react/24/solid';

/**
 * One button that runs the whole county pipeline and shows where it is:
 * find practices on Google → nest NPI providers under them → website
 * research. Each server call does one slice of work and returns; the loop
 * here calls the next slice until the stage is done. Closing the tab pauses;
 * pressing the button resumes.
 */

interface CountyRun {
  id: string;
  status: string;
  phase: string;
  error: string | null;
  source?: 'file' | 'api';
  summary: {
    placesFound?: number;
    placesPersonal?: number;
    discoverQueries?: number;
    discoverQueryTotal?: number;
    placesFromLookup?: number;
    providersAttached?: number;
    providersUnattached?: number;
    npisUpserted: number;
    quarantined: number;
    placesMatched: number;
    placesUnmatched: number;
    duplicatesFlagged: number;
    practicesFormed: number;
    providersLinked: number;
    retired?: number;
    nppesQueries: number;
    nppesQueryTotal: number;
  };
}

interface ResearchRun {
  id: string;
  status: string;
  error: string | null;
  index: number;
  total: number;
  summary: {
    total: number;
    researched: number;
    skippedNoUrl: number;
    fieldsFilled: number;
    lowConfidence?: number;
    notOnPage?: number;
    alreadyFilled?: number;
    nothingProposed?: number;
    modelErrors?: number;
    errors: string[];
    notes?: string[];
  };
}

type StageState = 'idle' | 'running' | 'done' | 'failed' | 'skipped';

interface Props {
  /** Id the pull job accepts: a hand-checked county id or a 5-digit FIPS. */
  countyId: string;
  countyFips: string;
  countyName: string;
}

/** Stage 1 searches Google; everything after it is stage 2. */
const DISCOVER_PHASES = new Set(['discover', 'details']);
/** Phases before the first practice formation; the list refreshes once these are past. */
const BEFORE_FORMATION = new Set(['discover', 'details', 'nppes']);

function classNames(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(' ');
}

function researchDetail(s: ResearchRun['summary']): string {
  const parts = [`${s.researched}/${s.total} sites read`, `${s.fieldsFilled} fields filled`];
  if (s.alreadyFilled) parts.push(`${s.alreadyFilled} already known from NPI or Places`);
  if (s.notOnPage) parts.push(`${s.notOnPage} dropped (not on the page)`);
  if (s.lowConfidence) parts.push(`${s.lowConfidence} dropped (low confidence)`);
  if (s.nothingProposed) parts.push(`${s.nothingProposed} sites gave nothing`);
  if (s.modelErrors) parts.push(`${s.modelErrors} model errors`);
  if (s.skippedNoUrl) parts.push(`${s.skippedNoUrl} no website`);
  return parts.join(' · ');
}

function stagesFromCountyRun(run: CountyRun | null): { pull: StageState; places: StageState } {
  if (!run) return { pull: 'idle', places: 'idle' };
  if (run.status === 'COMPLETED') return { pull: 'done', places: 'done' };
  const discovering = DISCOVER_PHASES.has(run.phase);
  if (run.status === 'FAILED') return discovering ? { pull: 'failed', places: 'idle' } : { pull: 'done', places: 'failed' };
  return discovering ? { pull: 'running', places: 'idle' } : { pull: 'done', places: 'running' };
}

function stageFromResearchRun(run: ResearchRun | null, configError: string | null): StageState {
  if (run?.status === 'COMPLETED') return 'done';
  if (run?.status === 'FAILED') return 'failed';
  if (run) return 'running';
  if (configError) return 'skipped';
  return 'idle';
}

function StageRow({
  step,
  title,
  state,
  active,
  detail,
  fraction,
  error,
}: {
  step: number;
  title: string;
  state: StageState;
  active: boolean;
  detail: string;
  fraction: number | null;
  error?: string | null;
}) {
  const icon =
    state === 'done' ? (
      <CheckCircleIcon className="h-6 w-6 text-green-600" />
    ) : state === 'failed' ? (
      <ExclamationCircleIcon className="h-6 w-6 text-red-600" />
    ) : state === 'skipped' ? (
      <MinusCircleIcon className="h-6 w-6 text-gray-300" />
    ) : (
      <span
        className={classNames(
          'flex h-6 w-6 items-center justify-center rounded-full border-2 text-xs font-semibold',
          active ? 'border-green-600 text-green-700' : 'border-gray-300 text-gray-400',
        )}
      >
        {step}
      </span>
    );
  return (
    <li className="flex gap-3 py-3">
      <div className="shrink-0 pt-0.5">{icon}</div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-3">
          <p className={classNames('text-sm font-semibold', state === 'idle' && !active ? 'text-gray-500' : 'text-gray-900')}>
            {title}
          </p>
          <span
            className={classNames(
              'rounded-full px-2 py-0.5 text-xs font-medium',
              state === 'done' && 'bg-green-50 text-green-700',
              state === 'running' && 'bg-blue-50 text-blue-700',
              state === 'failed' && 'bg-red-50 text-red-700',
              state === 'skipped' && 'bg-gray-100 text-gray-600',
              state === 'idle' && 'bg-gray-100 text-gray-500',
            )}
          >
            {state === 'running' ? 'Running' : state === 'done' ? 'Done' : state === 'failed' ? 'Failed' : state === 'skipped' ? 'Skipped' : 'Waiting'}
          </span>
        </div>
        <p className="mt-0.5 text-sm text-gray-600">{detail}</p>
        {state === 'running' && fraction !== null && (
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
            <div className="h-full rounded-full bg-green-600 transition-all" style={{ width: `${Math.round(fraction * 100)}%` }} />
          </div>
        )}
        {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
      </div>
    </li>
  );
}

export default function CountyPullRunner({ countyId, countyFips, countyName }: Props) {
  const queryClient = useQueryClient();
  const [countyRun, setCountyRun] = useState<CountyRun | null>(null);
  const [placesPending, setPlacesPending] = useState(0);
  const [researchRun, setResearchRun] = useState<ResearchRun | null>(null);
  const [withWebsite, setWithWebsite] = useState<number | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [loading, setLoading] = useState(true);

  const refreshCatalog = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['practices'] });
    queryClient.invalidateQueries({ queryKey: ['providers'] });
  }, [queryClient]);

  // Where the last run left off, so the button reads Resume or Pull again.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      axios.get(`/api/county-seed?countyId=${encodeURIComponent(countyId)}`),
      axios.get(`/api/research?countyFips=${encodeURIComponent(countyFips)}`),
    ])
      .then(([seed, research]) => {
        if (cancelled) return;
        setCountyRun(seed.data.latestRun ?? null);
        setPlacesPending(seed.data.placesPending ?? 0);
        setResearchRun(research.data.latestRun ?? null);
        setWithWebsite(research.data.withWebsite ?? null);
        setConfigError(research.data.configError ?? null);
      })
      .catch(() => {
        if (!cancelled) toast.error('Could not load the last run for this county');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [countyId, countyFips]);

  const run = async () => {
    setWorking(true);
    try {
      // Stages 1 and 2: the county job carries discovery, NPI, nesting, and lookup.
      let current = countyRun;
      if (!current || current.status === 'COMPLETED') current = null;
      let runId = current?.id;
      let mode: 'continue' | 'refresh' = current ? 'continue' : 'refresh';
      let formedOnce = false;
      for (let step = 0; step < 2000; step += 1) {
        const { data } = await axios.post('/api/county-seed', { countyId, runId, mode });
        const next = data.run as CountyRun;
        setCountyRun(next);
        setPlacesPending(data.placesPending ?? 0);
        runId = next.id;
        mode = 'continue';
        if (!formedOnce && !BEFORE_FORMATION.has(next.phase)) {
          formedOnce = true;
          refreshCatalog();
        }
        if (data.busy) {
          toast('A step is still running from another tab. Press the button again in a moment.');
          return;
        }
        if (next.status === 'FAILED') {
          toast.error(next.error || 'The pull failed');
          return;
        }
        if (next.status === 'COMPLETED') break;
      }
      refreshCatalog();

      // Stage 3: website research needs a model key; without one it is skipped, not failed.
      if (configError) return;
      let research = researchRun && researchRun.status !== 'COMPLETED' ? researchRun : null;
      let researchId = research?.id;
      let researchMode: 'continue' | 'refresh' = research ? 'continue' : 'refresh';
      for (let step = 0; step < 2000; step += 1) {
        const { data } = await axios.post('/api/research', { countyFips, runId: researchId, mode: researchMode });
        const next = data.run as ResearchRun;
        setResearchRun(next);
        researchId = next.id;
        researchMode = 'continue';
        if (data.busy) {
          toast('A research step is still running from another tab. Press the button again in a moment.');
          return;
        }
        if (next.status === 'FAILED') {
          toast.error(next.error || 'Research failed');
          return;
        }
        if (next.status === 'COMPLETED') break;
      }
      refreshCatalog();
      toast.success(`${countyName} is pulled, enriched, and researched.`);
    } catch (error) {
      const message = axios.isAxiosError(error) ? error.response?.data?.error || 'The pull failed' : 'The pull failed';
      toast.error(message);
    } finally {
      setWorking(false);
    }
  };

  const stages = stagesFromCountyRun(countyRun);
  const researchState = working && stages.places === 'done' && researchRun?.status !== 'COMPLETED'
    ? 'running'
    : stageFromResearchRun(researchRun, configError);
  const summary = countyRun?.summary;
  const placesDone = (summary?.placesMatched ?? 0) + (summary?.placesUnmatched ?? 0);
  const phase = countyRun?.phase ?? '';
  const nestingFraction = !summary
    ? null
    : phase === 'nppes' && summary.nppesQueryTotal > 0
      ? (summary.nppesQueries / summary.nppesQueryTotal) * 0.7
      : phase === 'group'
        ? 0.7
        : placesDone + placesPending > 0
          ? 0.7 + (placesDone / (placesDone + placesPending)) * 0.3
          : null;
  const nestingDetail = !summary
    ? 'Pediatricians and primary care physicians from the NPI registry, nested under the practices found. Their NPI registrations supply the fax.'
    : phase === 'nppes'
      ? `${summary.npisUpserted} providers · ${summary.nppesQueries}/${summary.nppesQueryTotal} ${countyRun?.source === 'api' ? 'ZIP queries' : 'slices'}`
      : [
          `${summary.npisUpserted} providers`,
          `${summary.providersAttached ?? 0} nested under a practice`,
          `${summary.providersUnattached ?? 0} not on Google${placesPending ? ` (${placesPending} still to look up)` : ''}`,
          summary.placesFromLookup ? `${summary.placesFromLookup} practices added from provider lookups` : null,
          summary.practicesFormed ? `${summary.practicesFormed} rows` : null,
          summary.retired ? `${summary.retired} no longer on NPI removed` : null,
        ].filter(Boolean).join(' · ');
  const failed = stages.pull === 'failed' || stages.places === 'failed' || researchState === 'failed';
  const allDone = stages.places === 'done' && (researchState === 'done' || researchState === 'skipped');

  const label = working ? 'Running…' : loading ? 'Loading…' : failed ? 'Resume' : allDone ? 'Pull again' : countyRun && countyRun.status !== 'COMPLETED' ? 'Continue' : 'Pull county';

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-gray-900">{countyName}</p>
          <p className="text-sm text-gray-500">Runs all three steps and keeps this page updated. Closing the tab pauses; the button resumes.</p>
        </div>
        <button
          type="button"
          onClick={run}
          disabled={working || loading}
          className="inline-flex items-center rounded-md bg-green-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-green-500 disabled:cursor-not-allowed disabled:bg-gray-300"
        >
          {label}
        </button>
      </div>

      <ol className="mt-4 divide-y divide-gray-100">
        <StageRow
          step={1}
          title="Find practices on Google"
          state={stages.pull}
          active={working && stages.pull !== 'done'}
          fraction={
            summary && (summary.discoverQueryTotal ?? 0) > 0
              ? (summary.discoverQueries ?? 0) / (summary.discoverQueryTotal ?? 1)
              : null
          }
          detail={
            summary && stages.pull !== 'idle'
              ? `${summary.placesFound ?? 0} listings${summary.placesPersonal ? ` (${summary.placesPersonal} in a clinician’s own name, folded into their practice)` : ''} · ${summary.discoverQueries ?? 0}/${summary.discoverQueryTotal ?? 0} searches${phase === 'details' ? ' · reading phone, website, and rating' : ''}`
              : 'Pediatricians, family medicine, and primary care listings in each town, with phone, website, and rating.'
          }
          error={stages.pull === 'failed' ? countyRun?.error : null}
        />
        <StageRow
          step={2}
          title={countyRun?.source === 'api' ? 'Nest providers from the NPPES API' : 'Nest providers from the NPI file'}
          state={stages.places}
          active={working && stages.pull === 'done' && stages.places !== 'done'}
          fraction={nestingFraction}
          detail={nestingDetail}
          error={stages.places === 'failed' ? countyRun?.error : null}
        />
        <StageRow
          step={3}
          title="Research websites"
          state={researchState}
          active={working && stages.places === 'done'}
          fraction={researchRun && researchRun.total > 0 ? researchRun.index / researchRun.total : null}
          detail={
            researchState === 'skipped'
              ? `Skipped — ${configError}`
              : researchRun
                ? researchDetail(researchRun.summary)
                : withWebsite !== null
                  ? `${withWebsite} practices have a website to read for fax, referral email, and forms.`
                  : 'Reads each practice website for fax, referral email, and referral forms.'
          }
          error={researchState === 'failed' ? researchRun?.error : null}
        />
      </ol>

      {researchRun && (researchRun.summary.notes?.length || researchRun.summary.errors.length) ? (
        <details className="mt-2 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600">
          <summary className="cursor-pointer font-medium text-gray-700">What research found, site by site</summary>
          <ul className="mt-2 space-y-1">
            {(researchRun.summary.notes ?? []).map((note, index) => (
              <li key={`n-${index}`} className="font-mono">{note}</li>
            ))}
            {researchRun.summary.errors.map((error, index) => (
              <li key={`e-${index}`} className="font-mono text-red-700">{error}</li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
