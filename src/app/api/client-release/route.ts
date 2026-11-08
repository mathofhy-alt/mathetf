export const dynamic = 'force-dynamic';

export async function GET() {
    return Response.json({ release: process.env.CLIENT_RELEASE || process.env.NEXT_PUBLIC_CLIENT_RELEASE || '20261108-download-v2' }, {
        headers: { 'Cache-Control': 'no-store, max-age=0' },
    });
}
