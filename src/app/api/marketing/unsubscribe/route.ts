import { NextRequest, NextResponse } from 'next/server';
import { verifyUnsubscribeToken, processUnsubscribeRequest } from '@/lib/marketing/unsubscribe-service';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const token = searchParams.get('token');

    if (!token) {
      return NextResponse.json({ error: 'Missing token parameter' }, { status: 400 });
    }

    const result = await processUnsubscribeRequest(token);
    if (!result.success) {
      return NextResponse.json({ error: result.message || 'Failed to process unsubscribe' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      email: result.email,
      message: result.message || 'Successfully unsubscribed from marketing communications.',
    });
  } catch (error: any) {
    console.error('Error in unsubscribe API:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    let token: string | null = null;
    const contentType = req.headers.get('content-type') || '';

    if (contentType.includes('application/json')) {
      const body = await req.json();
      token = body.token || null;
    }

    if (!token) {
      const { searchParams } = new URL(req.url);
      token = searchParams.get('token');
    }

    if (!token) {
      return NextResponse.json({ error: 'Missing token parameter' }, { status: 400 });
    }

    const result = await processUnsubscribeRequest(token);
    if (!result.success) {
      return NextResponse.json({ error: result.message || 'Failed to process unsubscribe' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      email: result.email,
      message: result.message || 'Successfully unsubscribed from marketing communications.',
    });
  } catch (error: any) {
    console.error('Error in unsubscribe API POST:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
