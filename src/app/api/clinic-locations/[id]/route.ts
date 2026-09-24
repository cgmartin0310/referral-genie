import { currentTenant, tenantErrorResponse } from '@/lib/tenant';
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { presentMarketCounty } from '@/lib/geo/market';

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

    const clinicLocation = await prisma.clinicLocation.update({
      where: { id },
      data: {
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
    // Check if location exists and has referral sources
    const existing = await prisma.clinicLocation.findFirst({
      where: { id, organizationId: tenant.organizationId },
      include: {
        _count: {
          select: { referralSources: true }
        }
      }
    });

    if (!existing) {
      return NextResponse.json(
        { error: 'Clinic location not found' },
        { status: 404 }
      );
    }

    // Don't allow deletion if there are referral sources linked
    if (existing._count.referralSources > 0) {
      return NextResponse.json(
        { 
          error: `Cannot delete clinic location. ${existing._count.referralSources} referral source(s) are linked to this location.`,
          count: existing._count.referralSources
        },
        { status: 400 }
      );
    }

    await prisma.clinicLocation.delete({
      where: { id }
    });

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
