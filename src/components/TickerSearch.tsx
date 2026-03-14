'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useDebouncedCallback } from 'use-debounce';
import { useRouter } from 'next/navigation';
import type { TickerSearchResult } from '@/lib/types';

interface TickerSearchProps {
  className?: string;
}

export default function TickerSearch({ className }: TickerSearchProps) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<TickerSearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [shake, setShake] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleMouseDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, []);

  const triggerShake = useCallback(() => {
    setShake(true);
    setTimeout(() => setShake(false), 400);
  }, []);

  const search = useDebouncedCallback(async (value: string) => {
    if (value.trim().length < 1) {
      setResults([]);
      setShowDropdown(false);
      setError(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/ticker/search?q=${encodeURIComponent(value.trim())}`);
      if (!res.ok) {
        throw new Error('Search failed');
      }
      const data: TickerSearchResult[] = await res.json();

      if (data.length === 0 && value.trim().length >= 2) {
        setError('Ticker not found');
        setResults([]);
        setShowDropdown(false);
        triggerShake();
      } else {
        setResults(data);
        setShowDropdown(data.length > 0);
        setError(null);
      }
    } catch {
      setError('Search failed. Please try again.');
      setResults([]);
      setShowDropdown(false);
    } finally {
      setIsLoading(false);
    }
  }, 300);

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const value = e.target.value;
    setQuery(value);
    if (value.trim().length === 0) {
      setResults([]);
      setShowDropdown(false);
      setError(null);
    } else {
      search(value);
    }
  }

  function handleResultClick(result: TickerSearchResult) {
    setShowDropdown(false);
    setQuery('');
    router.push(`/research/${result.symbol}`);
  }

  function handleInputFocus() {
    if (results.length > 0) {
      setShowDropdown(true);
    }
  }

  return (
    <div ref={containerRef} className={`relative w-full${className ? ` ${className}` : ''}`}>
      {/* Search input */}
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={handleInputChange}
          onFocus={handleInputFocus}
          placeholder="Search by ticker or company name..."
          className={[
            'w-full px-4 py-3 rounded-xl border bg-white text-gray-900 placeholder-gray-400',
            'text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent',
            'shadow-sm transition-all duration-150',
            error ? 'border-red-400' : 'border-gray-200',
            shake ? 'animate-shake' : '',
          ]
            .filter(Boolean)
            .join(' ')}
        />
        {isLoading && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </div>

      {/* Inline error */}
      {error && (
        <p className="mt-1.5 text-sm text-red-500 pl-1">{error}</p>
      )}

      {/* Dropdown */}
      {showDropdown && results.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-white rounded-xl border border-gray-100 shadow-lg overflow-hidden">
          {results.map((result) => (
            <button
              key={result.symbol}
              type="button"
              onClick={() => handleResultClick(result)}
              className="w-full px-4 py-3 text-left hover:bg-gray-50 transition-colors duration-100 border-b border-gray-50 last:border-b-0 flex items-center justify-between gap-3"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="font-mono font-semibold text-blue-600 text-sm shrink-0">
                  {result.symbol}
                </span>
                <span className="text-gray-700 text-sm truncate">
                  {result.longname ?? result.shortname ?? ''}
                </span>
              </div>
              <span className="text-gray-500 text-sm font-medium shrink-0">
                {result.currentPrice != null
                  ? `$${result.currentPrice.toFixed(2)}`
                  : '—'}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
