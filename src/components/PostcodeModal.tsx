import React from 'react';
import DaumPostcodeEmbed from 'react-daum-postcode';

interface PostcodeModalProps {
    isOpen: boolean;
    onClose: () => void;
    onComplete: (data: { postcode: string; address: string }) => void;
}

export default function PostcodeModal({ isOpen, onClose, onComplete }: PostcodeModalProps) {
    if (!isOpen) return null;

    const handleComplete = (data: any) => {
        let fullAddress = data.address;
        let extraAddress = '';

        if (data.addressType === 'R') {
            if (data.bname !== '') {
                extraAddress += data.bname;
            }
            if (data.buildingName !== '') {
                extraAddress += extraAddress !== '' ? `, ${data.buildingName}` : data.buildingName;
            }
            fullAddress += extraAddress !== '' ? ` (${extraAddress})` : '';
        }

        onComplete({
            postcode: data.zonecode,
            address: fullAddress,
        });
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh]">
                <div className="flex justify-between items-center p-4 border-b">
                    <h3 className="font-bold text-lg text-slate-800">우편번호 찾기</h3>
                    <button
                        onClick={onClose}
                        className="text-slate-400 hover:text-slate-600 transition-colors"
                        aria-label="닫기"
                    >
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
                
                <div className="flex-1 overflow-y-auto">
                    <DaumPostcodeEmbed 
                        onComplete={handleComplete} 
                        style={{ height: '400px', width: '100%' }}
                        autoClose={false}
                    />
                </div>
            </div>
        </div>
    );
}
