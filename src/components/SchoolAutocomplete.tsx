'use client';

import { useState, useEffect, useRef } from 'react';

interface School {
    id: string;
    name: string;
    region: string;
    district: string;
}

export default function SchoolAutocomplete({
    value,
    onChange,
    onSchoolSelect
}: {
    value: string,
    onChange: (name: string) => void,
    onSchoolSelect?: (school: School) => void
}) {
    const [suggestions, setSuggestions] = useState<School[]>([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [highlightedIndex, setHighlightedIndex] = useState(-1);
    const wrapperRef = useRef<HTMLDivElement>(null);
    const listRef = useRef<HTMLUListElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
                setShowSuggestions(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Auto-scroll effect
    useEffect(() => {
        if (showSuggestions && highlightedIndex >= 0 && listRef.current) {
            const list = listRef.current;
            const element = list.children[highlightedIndex] as HTMLElement;

            if (element) {
                const elementTop = element.offsetTop;
                const elementBottom = elementTop + element.offsetHeight;
                const listTop = list.scrollTop;
                const listBottom = listTop + list.offsetHeight;

                if (elementTop < listTop) {
                    list.scrollTop = elementTop;
                } else if (elementBottom > listBottom) {
                    list.scrollTop = elementBottom - list.offsetHeight;
                }
            }
        }
    }, [highlightedIndex, showSuggestions]);

    const handleInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        onChange(val);
        setHighlightedIndex(-1);

        if (val.length > 0) {
            const res = await fetch(`/api/schools/search?q=${encodeURIComponent(val)}`);
            const data = await res.json();
            if (data.schools) {
                setSuggestions(data.schools);
                setShowSuggestions(true);
            }
        } else {
            setSuggestions([]);
            setShowSuggestions(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (!showSuggestions || suggestions.length === 0) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setHighlightedIndex(prev => (prev < suggestions.length - 1 ? prev + 1 : prev));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setHighlightedIndex(prev => (prev > 0 ? prev - 1 : prev));
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (highlightedIndex >= 0) {
                handleSelect(suggestions[highlightedIndex]);
            }
        } else if (e.key === 'Escape') {
            setShowSuggestions(false);
        }
    };

    const handleSelect = (school: School) => {
        onChange(school.name);
        if (onSchoolSelect) onSchoolSelect(school);
        setShowSuggestions(false);
        setHighlightedIndex(-1);
    };

    return (
        <div className="relative" ref={wrapperRef}>
            <input
                className="w-full border p-2 rounded"
                value={value}
                onChange={handleInput}
                onKeyDown={handleKeyDown}
                onFocus={() => value && setShowSuggestions(true)}
                placeholder="예: 경기고 (입력시 자동검색)"
            />

            {showSuggestions && suggestions.length > 0 && (
                <ul
                    ref={listRef}
                    className="absolute z-10 w-full bg-white border rounded shadow-lg max-h-60 overflow-y-auto mt-1"
                >
                    {suggestions.map((school, index) => (
                        <li
                            key={school.id || school.name}
                            onClick={() => handleSelect(school)}
                            onMouseEnter={() => setHighlightedIndex(index)}
                            className={`px-4 py-2 cursor-pointer text-sm border-b last:border-0 ${index === highlightedIndex ? 'bg-indigo-100 text-indigo-900' : 'hover:bg-indigo-50'
                                }`}
                        >
                            <span className="font-bold">{school.name}</span>
                            <span className="text-gray-500 text-xs ml-2">({school.region} {school.district})</span>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
