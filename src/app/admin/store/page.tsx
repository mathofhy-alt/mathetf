import { notFound } from 'next/navigation';
import { requireAdmin } from '@/utils/admin-auth';
import StoreAdmin from './StoreAdmin';

export default async function StoreAdminPage() {
    const auth = await requireAdmin();
    if (!auth.authorized) notFound();
    return <StoreAdmin />;
}
