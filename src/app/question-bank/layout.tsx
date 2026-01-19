'use client';

export default function QuestionBankLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="flex h-screen bg-white">
            {/* Sidebar Area */}
            <aside className="w-64 border-r bg-gray-50 overflow-y-auto">
                {/* Placeholder for Sidebar Component */}
                <div className="p-4">
                    <h2 className="font-bold text-lg mb-4">필터 검색</h2>
                    {/* Filters will go here */}
                </div>
            </aside>

            {/* Main Content Area */}
            <main className="flex-1 overflow-hidden flex flex-col">
                {children}
            </main>
        </div>
    );
}
