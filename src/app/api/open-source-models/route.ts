import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/route-auth';
import { OPEN_SOURCE_MODELS, OPEN_SOURCE_MODEL_FAMILIES } from '@/lib/open-source-models';

export const GET = withAuth(async (request: NextRequest) => {
  const { searchParams } = request.nextUrl;

  // Parse query params
  const family = searchParams.get('family')?.toLowerCase();
  const capability = searchParams.get('capability')?.toLowerCase();
  const search = searchParams.get('search')?.toLowerCase();
  const page = Math.max(1, Number(searchParams.get('page')) || 1);
  const limit = Math.min(100, Math.max(1, Number(searchParams.get('limit')) || 50));

  // Filter
  let filtered = OPEN_SOURCE_MODELS;

  if (family) {
    filtered = filtered.filter(m => m.family.toLowerCase() === family);
  }

  if (capability) {
    filtered = filtered.filter(m =>
      m.capabilities.some(c => c.toLowerCase() === capability),
    );
  }

  if (search) {
    filtered = filtered.filter(m => {
      const q = search;
      return (
        m.name.toLowerCase().includes(q) ||
        m.family.toLowerCase().includes(q) ||
        m.developer.toLowerCase().includes(q) ||
        m.description.toLowerCase().includes(q) ||
        m.parameterCount.toLowerCase().includes(q)
      );
    });
  }

  // Paginate
  const total = filtered.length;
  const start = (page - 1) * limit;
  const models = filtered.slice(start, start + limit);

  return NextResponse.json({
    success: true,
    data: {
      models,
      total,
      page,
      limit,
      families: OPEN_SOURCE_MODEL_FAMILIES,
    },
  });
});
