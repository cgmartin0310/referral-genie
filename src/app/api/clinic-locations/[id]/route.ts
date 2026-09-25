import { currentTenant, tenantErrorResponse } from '@/lib/tenant';
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { presentMarketCounty } from '@/lib/geo/market';
import { clinicProfileFrom, locateAddress } from '@/lib/geo/locate';

// GET single clinic location
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const tenant = await currentTenant();
    const { id } = await params;
    const clinicLocation = await prisma.clinicLocation.findFirst({
      where: { id, organizationId: tenant.organizationId },
      include: {
        referralSources: {
          select: {
            id: true,
            name: true,
            contactPerson: true,
            contactPhone: true,
          }
        },
        marketCounties: {
          orderBy: [{ state: 'asc' as const }, { countyName: 'asc' as const }],
        },
      }
    });

    if (!clinicLocation) {
      return NextResponse.json(
        { error: 'Clinic location not found' },
        { status: 404 }
      );
    }

    const { marketCounties, ...rest } = clinicLocation;
    return NextResponse.json({
      ...rest,
      marketCounties: marketCounties.map((row) => presentMarketCounty(row)),
    });
  } catch (error) {
    const denied = tenantErrorResponse(error);
    if (denied) return denied;
    console.error('Error fetching clinic location:', error);
    return NextResponse.json(
      { error: 'Failed to fetch clinic location' },
      { status: 500 }
    );
  }
}

// PUT - Update clinic location
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const tenant = await currentTenant();
    const { id } = await params;
    const data = await request.json();

    // Check if location exists
    const existing = await prisma.clinicLocation.findFirst({
      where: { id, organizationId: tenant.organizationId }
    });

    if (!existing) {
      return NextResponse.json(
        { error: 'Clinic location not found' },
        { status: 404 }
      );
    }

    // If name is being changed, check for duplicates
    if (data.name && data.name !== existing.name) {
      const duplicate = await prisma.clinicLocation.findFirst({
        where: { name: data.name, organizationId: tenant.organizationId }
      });

      if (duplicate) {
        return NextResponse.json(
          { error: 'A clinic location with this name already exists' },
          { status: 400 }
        );
      }
    }

    // Re-locate the clinic when its address changes (or was never located).
    const addressChanged = ['address', 'city', 'state', 'zipCode'].some(
      (field) => data[field] !== undefined && data[field] !== existing[field as 'address' | 'city' | 'state' | 'zipCode'],
    );
    const located = addressChanged || existing.latitude == null
      ? await locateAddress([
          data.address ?? existing.address,
          data.city ?? existing.city,
          data.state ?? existing.state,
          data.zipCode ?? existing.zipCode,
        ])
      : null;

    const clinicLocation = await prisma.clinicLocation.update({
      where: { id },
      data: {
        ...clinicProfileFrom(data),
        ...(located ?? (addressChanged ? { latitude: null, longitude: null } : {})),
        ...(data.name !== undefined && { name: data.name }),
        ...(data.address !== undefined && { address: data.address }),
        ...(data.city !== undefined && { city: data.city }),
        ...(data.state !== undefined && { state: data.state }),
        ...(data.zipCode !== undefined && { zipCode: data.zipCode }),
        ...(data.phoneNumber !== undefined && { phoneNumber: data.phoneNumber }),
        ...(data.faxNumber !== undefined && { faxNumber: data.faxNumber }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
      },
    });

    return NextResponse.json(clinicLocation);
  } catch (error) {
    const denied = tenantErrorResponse(error);
    if (denied) return denied;
    console.error('Error updating clinic location:', error);
    return NextResponse.json(
      { error: 'Failed to update clinic location' },
      { status: 500 }
    );
  }
}

// DELETE clinic location
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const tenant = await currentTenant();
    const { id } = await params;
    const existing = await prisma.clinicLocation.findFirst({
      where: { id, organizationId: tenant.organizationId },
      select: { id: true },
    });

    if (!existing) {
      return NextResponse.json(
        { error: 'Clinic location not found' },
        { status: 404 }
      );
    }

    // Its referral list and counties go with it; campaigns keep their fax
    // history and lose only the link. Older records that named the clinic
    // (catalog sources, relationships) just forget it.
    await prisma.$transaction([
      prisma.referralSource.updateMany({ where: { clinicLocationId: id }, data: { clinicLocationId: null } }),
      prisma.sourceRelationship.updateMany({ where: { clinicLocationId: id }, data: { clinicLocationId: null } }),
      prisma.clinicLocation.delete({ where: { id } }),
    ]);

    return NextResponse.json(
      { message: 'Clinic location deleted successfully' },
      { status: 200 }
    );
  } catch (error) {
    const denied = tenantErrorResponse(error);
    if (denied) return denied;
    console.error('Error deleting clinic location:', error);
    return NextResponse.json(
      { error: 'Failed to delete clinic location' },
      { status: 500 }
    );
  }
}
