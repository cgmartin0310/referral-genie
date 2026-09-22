'use client';

import { useEffect, useState } from 'react';
import axios from 'axios';
import { toast } from 'react-hot-toast';

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
  loading: boolean;
  working: boolean;
}

export default function ResearchPanel({
  clinicId,
  sourceId,
  onProgress,
}: {
  clinicId?: string;
  sourceId?: string;
  onProgress?: (progress: { completed: boolean }) => void;
}) {
  const [state, setState] = useState<ResearchState>({
    run: null,
    sourceCount: 0,
    withWebsite: 0,
    loading: true,
    working: false,
  });

  useEffect(() => {
    let cancelled = false;
    const params = sourceId ? { sourceId } : { clinicId };
    axios
      .get('/api/research', { params })
      .then(({ data }) => {
        if (cancelled) return;
        setState({
          run: data.latestRun,
          sourceCount: data.sourceCount ?? 0,
          withWebsite: data.withWebsite ?? 0,
          loading: false,
          working: false,
        });
        onProgress?.({ completed: data.latestRun?.status === 'COMPLETED' });
      })
      .catch(() => {
        if (!cancelled) {
          toast.error('Failed to load research');
          setState((current) => ({ ...current, loading: false }));
        }
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clinicId, sourceId]);

  const runResearch = async () => {
    setState((current) => ({ ...current, working: true }));
    const resume = state.run && state.run.status !== 'COMPLETED';
    let runId = resume ? state.run?.id : undefined;
    let mode: 'continue' | 'refresh' = resume ? 'continue' : 'refresh';
    try {
      for (let step = 0; step < 500; step += 1) {
        const { data } = await axios.post('/api/research', {
          clinicId,
          sourceId,
          runId,
          mode,
        });
        const run = data.run as ResearchRun;
        setState((current) => ({ ...current, run, working: true }));
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
      const message = axios.isAxiosError(error)
        ? error.response?.data?.error || 'Research failed'
        : 'Research failed';
      toast.error(message);
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

  return (
    <section id="research" className="bg-white shadow rounded-lg p-6">
      <h2 className="text-lg font-medium text-gray-900">Research missing info</h2>
      <p className="mt-1 text-sm text-gray-600">
        After Places enrichment, read each practice website and fill blank phone, fax, provider count,
        referral email, referral form, and channel only when the page states them. Blank stays blank when
        the page does not.
      </p>
      <p className="mt-2 text-sm text-gray-600">
        {state.loading
          ? 'Loading research status…'
          : `${state.withWebsite} of ${state.sourceCount} referral sources have a public website. Sources without one are skipped.`}
      </p>
      <button
        type="button"
        onClick={runResearch}
        disabled={state.working || state.loading || state.sourceCount === 0}
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
