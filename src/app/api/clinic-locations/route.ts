import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { DEFAULT_ORGANIZATION_ID } from '@/lib/org';
import { presentMarketCounty } from '@/lib/geo/market';
import { estimateMonthlyReferrals, sumEstimates, type EstimateRates } from '@/lib/practices/estimate';
import { loadEstimateRates } from '@/lib/practices/estimate-settings';

const clinicInclude = {
  _count: {
    select: { referralSources: true, clinicPractices: true },
  },
  marketCounties: {
    orderBy: [{ state: 'asc' as const }, { countyName: 'asc' as const }],
  },
  clinicPractices: {
    select: { practice: { select: { providerCount: true, taxonomyMix: true } } },
  },
};

type ListedPractice = { practice: { providerCount: number; taxonomyMix: unknown } };

function serializeClinic<
  T extends {
    marketCounties: { id: string; countyFips: string; countyName: string; state: string }[];
    clinicPractices?: ListedPractice[];
  },
>(clinic: T, rates: EstimateRates) {
  const { marketCounties, clinicPractices = [], ...rest } = clinic;
  const estimates = clinicPractices.map((row) =>
    estimateMonthlyReferrals(row.practice.taxonomyMix as Record<string, number> | null, rates),
  );
  return {
    ...rest,
    marketCounties: marketCounties.map((row) => presentMarketCounty(row)),
    referralList: {
      practices: clinicPractices.length,
      providers: clinicPractices.reduce((sum, row) => sum + row.practice.providerCount, 0),
      estimate: sumEstimates(estimates),
    },
  };
}

// GET all clinic locations
export async function GET() {
  try {
    const clinicLocations = await prisma.clinicLocation.findMany({
      where: { organizationId: DEFAULT_ORGANIZATION_ID },
      orderBy: {
        name: 'asc',
      },
      include: clinicInclude,
    });

    const rates = await loadEstimateRates();
    return NextResponse.json(clinicLocations.map((clinic) => serializeClinic(clinic, rates)));
  } catch (error) {
    console.error('Error fetching clinic locations:', error);
    return NextResponse.json(
      { error: 'Failed to fetch clinic locations' },
      { status: 500 }
    );
  }
}

// POST - Create new clinic location
export async function POST(request: NextRequest) {
  try {
    const data = await request.json();

    // Validate required fields
    if (!data.name) {
      return NextResponse.json(
        { error: 'Name is required' },
        { status: 400 }
      );
    }

    // Check if name already exists
    const existing = await prisma.clinicLocation.findFirst({
      where: { name: data.name, organizationId: DEFAULT_ORGANIZATION_ID }
    });

    if (existing) {
      return NextResponse.json(
        { error: 'A clinic location with this name already exists' },
        { status: 400 }
      );
    }

    const clinicLocation = await prisma.clinicLocation.create({
      data: {
        organizationId: DEFAULT_ORGANIZATION_ID,
        name: data.name,
        address: data.address || null,
        city: data.city || null,
        state: data.state || null,
        zipCode: data.zipCode || null,
        phoneNumber: data.phoneNumber || null,
        faxNumber: data.faxNumber || null,
        isActive: data.isActive !== undefined ? data.isActive : true,
      },
    });

    return NextResponse.json(clinicLocation, { status: 201 });
  } catch (error) {
    console.error('Error creating clinic location:', error);
    return NextResponse.json(
      { error: 'Failed to create clinic location' },
      { status: 500 }
    );
  }
}
