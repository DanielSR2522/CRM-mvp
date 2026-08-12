import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getSupabaseAdmin, isAdminConfigured } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_MIME_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];

export async function POST(request: Request) {
  try {
    // 1. Authenticate Agent using canonical server auth pattern
    const cookieStore = await cookies();
    const supabaseServer = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll: () => cookieStore.getAll(),
          setAll: (cookiesToSet) => {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          },
        },
      }
    );

    let user = (await supabaseServer.auth.getUser()).data.user;

    // Fallback: check Authorization Bearer header if cookies didn't resolve user
    if (!user) {
      const authHeader = request.headers.get('authorization');
      const accessToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
      if (accessToken && isAdminConfigured()) {
        const admin = getSupabaseAdmin();
        const { data: userData } = await admin.auth.getUser(accessToken);
        user = userData?.user || null;
      }
    }

    if (!user) {
      return NextResponse.json(
        {
          error: 'UNAUTHORIZED',
          message: 'Your session has expired. Please sign in again.',
        },
        { status: 401 }
      );
    }

    const userId = user.id;

    // 2. Parse FormData
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json(
        { error: 'INVALID_FILE', message: 'No file provided.' },
        { status: 400 }
      );
    }

    if (!ALLOWED_MIME_TYPES.includes(file.type.toLowerCase())) {
      return NextResponse.json(
        { error: 'INVALID_MIME_TYPE', message: 'Invalid file type. Only PNG, JPG, and WEBP images are allowed.' },
        { status: 400 }
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: 'FILE_TOO_LARGE', message: 'File size exceeds 5 MB limit.' },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Validate magic bytes
    const isPng = buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    const isJpg = buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]));
    const isWebp = buffer.subarray(8, 12).toString('ascii') === 'WEBP';

    if (!isPng && !isJpg && !isWebp) {
      return NextResponse.json(
        { error: 'CORRUPTED_FILE', message: 'Corrupted image file or unsupported format.' },
        { status: 400 }
      );
    }

    const sanitizedName = file.name.replace(/[^a-zA-Z0-9_.-]/g, '_');
    const assetId = crypto.randomUUID();
    const storagePath = `${userId}/consent-assets/${assetId}/${sanitizedName}`;

    if (!isAdminConfigured()) {
      return NextResponse.json(
        { error: 'SERVER_MISCONFIGURED', message: 'Supabase admin client is not configured.' },
        { status: 500 }
      );
    }

    const admin = getSupabaseAdmin();
    const { error: uploadErr } = await admin.storage
      .from('signatures')
      .upload(storagePath, buffer, { contentType: file.type, upsert: true });

    if (uploadErr) {
      console.error('Storage upload error:', uploadErr);
      return NextResponse.json(
        { error: 'UPLOAD_FAILED', message: 'Unable to upload image. Please try again.' },
        { status: 500 }
      );
    }

    const { data: signedData } = await admin.storage
      .from('signatures')
      .createSignedUrl(storagePath, 60 * 60 * 24 * 365 * 10); // 10 years

    const url = signedData?.signedUrl || '';

    return NextResponse.json({
      success: true,
      url,
      path: storagePath,
    });
  } catch (err: any) {
    console.error('Error in upload-asset route:', err);
    return NextResponse.json(
      { error: 'SERVER_ERROR', message: err?.message || 'Unable to upload image. Please try again.' },
      { status: 500 }
    );
  }
}
