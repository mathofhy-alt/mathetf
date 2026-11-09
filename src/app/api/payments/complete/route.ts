import { NextRequest } from 'next/server';
import { completeOrder } from '@/lib/payments/complete';
export const maxDuration = 60;
export async function POST(req: NextRequest) { return completeOrder(req); }
