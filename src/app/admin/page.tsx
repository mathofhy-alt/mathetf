'use client';

import { useState } from 'react';
import AdminQuestionsPage from './questions/page';
import AdminIngestPage from './ingest/page';
import AdminSettlementsPage from './settlements/page';
import { Package, Upload, DollarSign } from 'lucide-react';

export default function AdminDashboard() {
    const [activeTab, setActiveTab] = useState<'questions' | 'ingest' | 'settlements'>('questions');

    const tabs = [
        { id: 'questions', label: '문제 관리', icon: Package },
        { id: 'ingest', label: '문제 업로드', icon: Upload },
        { id: 'settlements', label: '정산 관리', icon: DollarSign },
    ] as const;

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col">
            {/* Admin Header / Tabs */}
            <div className="bg-white border-b shadow-sm z-10 sticky top-0">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex justify-between h-16 items-center">
                        <div className="flex items-center gap-2">
                            <span className="text-xl font-bold text-gray-900">관리자 대시보드</span>
                            <span className="text-xs bg-slate-800 text-white px-2 py-1 rounded">Admin</span>
                        </div>

                        {/* Tab Navigation */}
                        <nav className="flex space-x-4">
                            {tabs.map((tab) => {
                                const Icon = tab.icon;
                                const isActive = activeTab === tab.id;
                                return (
                                    <button
                                        key={tab.id}
                                        onClick={() => setActiveTab(tab.id)}
                                        className={`
                                            flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors
                                            ${isActive
                                                ? 'bg-blue-50 text-blue-700'
                                                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                                            }
                                        `}
                                    >
                                        <Icon size={18} />
                                        {tab.label}
                                    </button>
                                );
                            })}
                        </nav>

                        <div className="text-sm text-gray-500">
                            {new Date().toLocaleDateString()}
                        </div>
                    </div>
                </div>
            </div>

            {/* Content Area */}
            <main className="flex-1 overflow-auto">
                {activeTab === 'questions' && (
                    <div className="animate-in fade-in duration-300">
                        <AdminQuestionsPage />
                    </div>
                )}
                {activeTab === 'ingest' && (
                    <div className="animate-in fade-in duration-300">
                        <AdminIngestPage />
                    </div>
                )}
                {activeTab === 'settlements' && (
                    <div className="animate-in fade-in duration-300">
                        <AdminSettlementsPage />
                    </div>
                )}
            </main>
        </div>
    );
}
