"use client";

import { useState } from 'react';
import UploadModal from '@/components/UploadModal';

export default function TestUploadPage() {
    const [isOpen, setIsOpen] = useState(true);

    const mockUser = { id: 'test-user', email: 'test@example.com' };
    const mockRegions = ['서울', '경기'];
    const mockDistricts = { '서울': ['강남구', '서초구'], '경기': ['성남시', '수원시'] };
    const mockSchools = {
        '서울': { '강남구': ['서울고', '경기고'], '서초구': ['서초고'] },
        '경기': { '성남시': ['분당고'], '수원시': ['수원고'] }
    };

    return (
        <div className="p-10">
            <h1 className="text-2xl font-bold mb-4">Upload Modal Test Page</h1>
            <button
                onClick={() => setIsOpen(true)}
                className="px-4 py-2 bg-blue-500 text-white rounded"
            >
                Open Modal
            </button>
            <UploadModal
                isOpen={isOpen}
                onClose={() => setIsOpen(false)}
                user={mockUser}
                regions={mockRegions}
                districtsMap={mockDistricts}
                schoolsMap={mockSchools}
            />
        </div>
    );
}
