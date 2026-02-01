import React from 'react';

interface FileIconProps {
    className?: string; // Additional classes
    size?: number; // Size in pixels
    grayscale?: boolean; // New prop for grayscale mode
}

export const PdfFileIcon: React.FC<FileIconProps> = ({ className = '', size = 24, grayscale = false }) => {
    const mainFill = grayscale ? "#F3F4F6" : "#FFEDED";
    const strokeColor = grayscale ? "#9CA3AF" : "#E11D48";
    const labelFill = grayscale ? "#9CA3AF" : "#E11D48";

    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className={className}
        >
            {/* Paper Background */}
            <path d="M4 4C4 2.89543 4.89543 2 6 2H14L20 8V20C20 21.1046 19.1046 22 18 22H6C4.89543 22 4 21.1046 4 20V4Z" fill={mainFill} stroke={strokeColor} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M14 2V8H20" stroke={strokeColor} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />

            {/* PDF Label/Symbol */}
            <rect x="6" y="11" width="12" height="8" rx="1" fill={labelFill} />
            <text x="12" y="16.5" textAnchor="middle" fill="white" fontSize="5" fontWeight="bold" fontFamily="sans-serif">PDF</text>
        </svg>
    );
};

export const HwpFileIcon: React.FC<FileIconProps> = ({ className = '', size = 24, grayscale = false }) => {
    const mainFill = grayscale ? "#F3F4F6" : "#EFF6FF";
    const strokeColor = grayscale ? "#9CA3AF" : "#2563EB";
    const labelFill = grayscale ? "#9CA3AF" : "#2563EB";

    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className={className}
        >
            {/* Paper Background */}
            <path d="M4 4C4 2.89543 4.89543 2 6 2H14L20 8V20C20 21.1046 19.1046 22 18 22H6C4.89543 22 4 21.1046 4 20V4Z" fill={mainFill} stroke={strokeColor} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M14 2V8H20" stroke={strokeColor} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />

            {/* HWP Label/Symbol */}
            <rect x="6" y="11" width="12" height="8" rx="1" fill={labelFill} />
            <text x="12" y="16.5" textAnchor="middle" fill="white" fontSize="5" fontWeight="bold" fontFamily="sans-serif">한글</text>
        </svg>
    );
};

export const DbFileIcon: React.FC<FileIconProps & { purchased?: boolean }> = ({ className = '', size = 24, grayscale = false, purchased = false }) => {
    // If purchased, use Indigo. If grayscale (not registered), use Gray. Otherwise (available), use Green.
    const mainFill = grayscale ? "#F3F4F6" : (purchased ? "#EEF2FF" : "#F0FDF4");
    const strokeColor = grayscale ? "#9CA3AF" : (purchased ? "#4F46E5" : "#16A34A");
    const labelFill = grayscale ? "#9CA3AF" : (purchased ? "#4F46E5" : "#16A34A");

    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className={className}
        >
            {/* Database Stack Icon */}
            <path d="M4 6C4 8.20914 7.58172 10 12 10C16.4183 10 20 8.20914 20 6" stroke={strokeColor} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M4 12C4 14.2091 7.58172 16 12 16C16.4183 16 20 14.2091 20 12" stroke={strokeColor} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M20 6V18C20 20.2091 16.4183 22 12 22C7.58172 22 4 20.2091 4 18V6" stroke={strokeColor} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            <ellipse cx="12" cy="6" rx="8" ry="4" stroke={strokeColor} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill={mainFill} />

            {/* DB Label */}
            <rect x="6" y="11" width="12" height="8" rx="1" fill={labelFill} opacity="0.9" />
            <text x="12" y="16.5" textAnchor="middle" fill="white" fontSize="5" fontWeight="bold" fontFamily="sans-serif">DB</text>
        </svg>
    );
};
