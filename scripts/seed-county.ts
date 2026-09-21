import { advanceCountyIngest, createOrResumeRun } from '../src/lib/ingest/advance';

function argValue(flag: string): string | null {
  const index = process.argv.indexOf(flag);
  if (index === -1) return null;
  return process.argv[index + 1] ?? null;
}

async function main() {
  if (process.argv.includes('--help')) {
    console.log('Usage: npx tsx scripts/seed-county.ts [--county lenoir-nc] [--refresh]');
    console.log('Resumes an unfinished run. If the last run finished, starts another idempotent refresh.');
    console.log('--refresh replaces an unfinished run with a new one.');
    process.exit(0);
  }

  const countyId = argValue('--county') ?? 'lenoir-nc';
  const mode = process.argv.includes('--refresh') ? 'refresh' : 'continue';
  const created = await createOrResumeRun({ countyId, mode });
  const runId = created.id;
  console.log(`County seed ${created.id} ${created.countyName} (${created.countyId}) status=${created.status} phase=${created.phase}`);

  for (let step = 0; step < 2000; step += 1) {
    const result = await advanceCountyIngest(runId);
    const summary = result.run.summary;
    console.log(
      `${result.run.status} ${result.run.phase} npis=${summary.npisUpserted} matched=${summary.placesMatched} unmatched=${summary.placesUnmatched} quarantined=${summary.quarantined} duplicates=${summary.duplicatesFlagged} pending=${result.placesPending}${result.busy ? ' busy' : ''}`,
    );
    if (result.run.status === 'COMPLETED') {
      process.exit(0);
    }
    if (result.run.status === 'FAILED') {
      console.error(result.run.error);
      process.exit(1);
    }
    if (result.busy) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  throw new Error('County seed exceeded the step limit');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
