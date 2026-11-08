"use client";
import { useEffect, useState } from 'react';
import PassModal from '@/components/question-bank/PassModal';
import { usePassInfo } from '@/lib/usePassInfo';
import { createClient } from '@/utils/supabase/client';

/** 원래 작업을 메모리에 유지하고 결제는 새 탭에서 진행한다. */
export default function BundlePassGate() {
    const [open, setOpen] = useState(false);
    const [user, setUser] = useState<any>(null);
    const { info, refresh } = usePassInfo(open);
    useEffect(() => {
        const show = () => {
            setOpen(true);
            createClient().auth.getUser().then(({ data }) => setUser(data.user));
        };
        window.addEventListener('qb-pass-required', show);
        return () => window.removeEventListener('qb-pass-required', show);
    }, []);
    return open ? <PassModal user={user} info={info} from="bundle_blocked" purchaseInNewTab
        onClose={() => setOpen(false)} onPaid={() => { void refresh(); setOpen(false); }} /> : null;
}
