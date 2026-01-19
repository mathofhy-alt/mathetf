'use client';

import { useEffect } from 'react';

export default function LoginAlert({ message }: { message: string }) {
    useEffect(() => {
        if (message) {
            // Small timeout to ensure browser is ready
            const timer = setTimeout(() => {
                alert(message);
            }, 100);
            return () => clearTimeout(timer);
        }
    }, [message]);

    return null;
}
