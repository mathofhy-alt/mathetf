import { NextRequest } from 'next/server';
import { completeOrder } from '@/lib/payments/complete';
export async function POST(req: NextRequest) { return completeOrder(req, 'cart'); }
