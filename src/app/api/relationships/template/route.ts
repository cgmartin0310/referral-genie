import { NextResponse } from 'next/server';
import { TEMPLATE_CSV } from '@/lib/relationships/import';

/** A starter spreadsheet with the columns the import understands and one example row. */
export async function GET() {
  return new NextResponse(TEMPLATE_CSV, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="referral-sources-template.csv"',
    },
  });
}
