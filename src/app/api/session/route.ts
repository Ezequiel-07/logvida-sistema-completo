
import { NextResponse, type NextRequest } from 'next/server';
import { getAdminAuth } from '@/server/lib/firebaseAdmin';

// This API route handles creating and clearing the session cookie.
// It's called by the AuthContext on login and logout.

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader) {
    return NextResponse.json({ success: false, error: 'No token provided' }, { status: 401 });
  }

  const idToken = authHeader.split('Bearer ')[1];
  if (!idToken) {
    return NextResponse.json({ success: false, error: 'Malformed token' }, { status: 401 });
  }

  // Session expires in 14 days
  const expiresIn = 60 * 60 * 24 * 14 * 1000;

  try {
    const sessionCookie = await getAdminAuth().createSessionCookie(idToken, { expiresIn });
    const options = {
      name: 'session',
      value: sessionCookie,
      maxAge: expiresIn / 1000, // maxAge is in seconds
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      path: '/',
    };
    
    const response = NextResponse.json({ success: true }, { status: 200 });
    response.cookies.set(options);
    
    return response;
  } catch (error) {
    return NextResponse.json({ success: false, error: 'Failed to create session' }, { status: 500 });
  }
}

export async function DELETE() {
  const options = {
    name: 'session',
    value: '',
    maxAge: -1, // Expire the cookie immediately
    path: '/',
  };
  
  const response = NextResponse.json({ success: true }, { status: 200 });
  response.cookies.set(options);
  
  return response;
}
