import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/** Whether the NPI file is loaded, and which one. Pulls read it when it is. */
export async function GET() {
  try {
    const [latest, records] = await Promise.all([
      prisma.npiLoad.findFirst({ orderBy: { startedAt: 'desc' } }),
      prisma.npiRecord.count(),
    ]);
    return NextResponse.json({
      loaded: records > 0,
      records,
      latest: latest
        ? {
            id: latest.id,
            fileName: latest.fileName,
            status: latest.status,
            startedAt: latest.startedAt,
            finishedAt: latest.finishedAt,
            rowsKept: latest.rowsKept,
            countyMapped: latest.countyMapped,
            error: latest.error,
          }
        : null,
    });
  } catch (error) {
    console.error('Error reading NPI file status:', error);
    return NextResponse.json({ error: 'Failed to read NPI file status' }, { status: 500 });
  }
}
