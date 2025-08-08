import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// GET single clinic location
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const clinicLocation = await prisma.clinicLocation.findUnique({
      where: { id: params.id },
      include: {
        referralSources: {
          select: {
            id: true,
            name: true,
            contactPerson: true,
            contactPhone: true,
          }
        }
      }
    });

    if (!clinicLocation) {
      return NextResponse.json(
        { error: 'Clinic location not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(clinicLocation);
  } catch (error) {
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
  { params }: { params: { id: string } }
) {
  try {
    const data = await request.json();

    // Check if location exists
    const existing = await prisma.clinicLocation.findUnique({
      where: { id: params.id }
    });

    if (!existing) {
      return NextResponse.json(
        { error: 'Clinic location not found' },
        { status: 404 }
      );
    }

    // If name is being changed, check for duplicates
    if (data.name && data.name !== existing.name) {
      const duplicate = await prisma.clinicLocation.findUnique({
        where: { name: data.name }
      });

      if (duplicate) {
        return NextResponse.json(
          { error: 'A clinic location with this name already exists' },
          { status: 400 }
        );
      }
    }

    const clinicLocation = await prisma.clinicLocation.update({
      where: { id: params.id },
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
  { params }: { params: { id: string } }
) {
  try {
    // Check if location exists and has referral sources
    const existing = await prisma.clinicLocation.findUnique({
      where: { id: params.id },
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
      where: { id: params.id }
    });

    return NextResponse.json(
      { message: 'Clinic location deleted successfully' },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error deleting clinic location:', error);
    return NextResponse.json(
      { error: 'Failed to delete clinic location' },
      { status: 500 }
    );
  }
}
