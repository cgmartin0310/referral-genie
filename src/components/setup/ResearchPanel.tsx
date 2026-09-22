'use client';

import { useEffect, useState } from 'react';
import axios from 'axios';
import { toast } from 'react-hot-toast';
import { researchCountMessage } from '@/lib/research/status-message';

interface ResearchSummary {
  total: number;
  researched: number;
  skippedNoUrl: number;
  fieldsFilled: number;
  lowConfidence: number;
  errors: string[];
}

interface ResearchRun {
  id: string;
  status: string;
  error: string | null;
  summary: ResearchSummary;
  index: number;
  total: number;
}

interface ResearchState {
  run: ResearchRun | null;
  sourceCount: number;
  withWebsite: number;
  countsKnown: boolean;
  loading: boolean;
  working: boolean;
  loadError: string | null;
  actionError: string | null;
  configError: string | null;
  runError: string | null;
}

function errorMessage(error: unknown, fallback: string): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data;
    if (data && typeof data === 'object' && 'error' in data && typeof data.error === 'string' && data.error.trim()) {
      return data.error;
    }
  }
  return fallback;
}

export default function ResearchPanel({
  clinicId,
  countyFips,
  sourceId,
  refreshToken = '',
  onProgress,
}: {
  clinicId?: string;
  /** Research every source pulled for this county instead of a clinic's market. */
  countyFips?: string;
  sourceId?: string;
  refreshToken?: string | number;
  onProgress?: (progress: { completed: boolean }) => void;
}) {
  const [state, setState] = useState<ResearchState>({
    run: null,
    sourceCount: 0,
    withWebsite: 0,
    countsKnown: false,
    loading: true,
    working: false,
    loadError: null,
    actionError: null,
    configError: null,
    runError: null,
  });

  useEffect(() => {
    let cancelled = false;
    const params = sourceId ? { sourceId } : clinicId ? { clinicId } : { countyFips };
    setState((current) => ({ ...current, loading: true, loadError: null }));
    axios
      .get('/api/research', { params })
      .then(({ data }) => {
        if (cancelled) return;
        const countsKnown = typeof data.sourceCount === 'number' && typeof data.withWebsite === 'number';
        setState((current) => ({
          ...current,
          run: data.latestRun ?? null,
          sourceCount: countsKnown ? data.sourceCount : current.sourceCount,
          withWebsite: countsKnown ? data.withWebsite : current.withWebsite,
          countsKnown: countsKnown || current.countsKnown,
          loading: false,
          loadError: countsKnown ? null : 'Research status did not include a source count.',
          configError: typeof data.configError === 'string' ? data.configError : null,
          runError: typeof data.runError === 'string' ? data.runError : null,
        }));
        onProgress?.({ completed: data.latestRun?.status === 'COMPLETED' });
      })
      .catch((error) => {
        if (cancelled) return;
        const message = errorMessage(error, 'Failed to load research');
        toast.error(message);
        setState((current) => ({
          ...current,
          loading: false,
          loadError: message,
        }));
      });
    return () => {
      cancelled = true;
    };
    // onProgress is a parent callback; clinic, source, and pull progress decide when to reload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clinicId, countyFips, sourceId, refreshToken]);

  const runResearch = async () => {
    setState((current) => ({ ...current, working: true, actionError: null }));
    const resume = state.run && state.run.status !== 'COMPLETED';
    let runId = resume ? state.run?.id : undefined;
    let mode: 'continue' | 'refresh' = resume ? 'continue' : 'refresh';
    try {
      for (let step = 0; step < 500; step += 1) {
        const { data } = await axios.post('/api/research', {
          clinicId,
          countyFips,
          sourceId,
          runId,
          mode,
        });
        const run = data.run as ResearchRun;
        setState((current) => ({ ...current, run, working: true, actionError: null }));
        onProgress?.({ completed: run.status === 'COMPLETED' });
        runId = run.id;
        mode = 'continue';
        if (data.busy) {
          toast('A research step is still running. Press the button again in a moment.');
          break;
        }
        if (run.status === 'FAILED') {
          toast.error(run.error || 'Research failed');
          break;
        }
        if (run.status === 'COMPLETED') {
          toast.success(sourceId ? 'Research finished for this practice.' : 'Research finished for this market.');
          break;
        }
      }
    } catch (error) {
      const message = errorMessage(error, 'Research failed');
      toast.error(message);
      setState((current) => ({ ...current, actionError: message }));
    } finally {
      setState((current) => ({ ...current, working: false }));
    }
  };

  const label = state.working
    ? 'Researching…'
    : !state.run || state.run.status === 'COMPLETED'
      ? state.run ? 'Research again' : 'Research missing info'
      : state.run.status === 'FAILED'
        ? 'Resume research'
        : 'Continue research';

  const summary = state.run?.summary;
  const statusText = researchCountMessage({
    loading: state.loading,
    countsKnown: state.countsKnown,
    loadError: state.loadError,
    sourceCount: state.sourceCount,
    withWebsite: state.withWebsite,
    singleSource: Boolean(sourceId),
  });
  const canResearch = state.countsKnown && state.sourceCount > 0 && !state.loading && !state.working;

  return (
    <section id="research" className="bg-white shadow rounded-lg p-6">
      <h2 className="text-lg font-medium text-gray-900">Research missing info</h2>
      <p className="mt-1 text-sm text-gray-600">
        After Places enrichment, read each practice website and fill blank phone, fax, provider count,
        referral email, referral form, and channel only when the page states them. Blank stays blank when
        the page does not.
      </p>
      <p className="mt-2 text-sm text-gray-600">{statusText}</p>
      {state.countsKnown && state.loadError && (
        <p className="mt-2 text-sm text-red-700">{state.loadError}</p>
      )}
      {state.runError && <p className="mt-2 text-sm text-red-700">{state.runError}</p>}
      {state.configError && state.run?.error !== state.configError && (
        <p className="mt-2 text-sm text-red-700">{state.configError}</p>
      )}
      {state.actionError && <p className="mt-2 text-sm text-red-700">{state.actionError}</p>}
      <button
        type="button"
        onClick={runResearch}
        disabled={!canResearch}
        className="mt-4 inline-flex items-center rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:bg-indigo-300"
      >
        {label}
      </button>
      {summary && (
        <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="Researched" value={`${state.run?.index ?? 0} / ${state.run?.total ?? summary.total}`} />
          <Stat label="Fields filled" value={String(summary.fieldsFilled)} />
          <Stat label="No website" value={String(summary.skippedNoUrl)} />
          <Stat label="Left blank" value={String(summary.lowConfidence)} />
        </dl>
      )}
      {state.run?.error && <p className="mt-3 text-sm text-red-700">{state.run.error}</p>}
      {summary && summary.errors.length > 0 && (
        <ul className="mt-3 list-disc pl-5 text-sm text-amber-800">
          {summary.errors.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</dt>
      <dd className="mt-1 text-2xl font-semibold text-gray-900">{value}</dd>
    </div>
  );
}
