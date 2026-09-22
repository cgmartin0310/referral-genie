import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import { DEFAULT_ORGANIZATION_ID } from '@/lib/org';
import { presentProvider } from '@/lib/practices/present';

export const dynamic = 'force-dynamic';

/** Providers with the practice they work at and where a fax to them goes. */
export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const countyFips = params.get('countyFips')?.trim() || null;
    const q = params.get('q')?.trim() || null;

    const where: Prisma.ProviderWhereInput = {
      organizationId: DEFAULT_ORGANIZATION_ID,
      ...(countyFips ? { countyFips } : {}),
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: 'insensitive' } },
              { npiNumber: { contains: q } },
              { practice: { name: { contains: q, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };

    const rows = await prisma.provider.findMany({
      where,
      include: { practice: { select: { id: true, name: true, faxNumber: true } } },
      orderBy: [{ name: 'asc' }],
    });

    return NextResponse.json({
      providers: rows.map((row) => presentProvider(row, row.practice)),
    });
  } catch (error) {
    console.error('Error listing providers:', error);
    return NextResponse.json({ error: 'Failed to load providers' }, { status: 500 });
  }
}
