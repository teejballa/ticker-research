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
  const [focused, setFocused] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close on outside click
  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
        setFocused(false);
      }
    }
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
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
      if (!res.ok) throw new Error('Search failed');
      const data: TickerSearchResult[] = await res.json();
      if (data.length === 0 && value.trim().length >= 2) {
        setError('NO_MATCH');
        setResults([]);
        setShowDropdown(false);
        triggerShake();
      } else {
        setResults(data);
        setShowDropdown(data.length > 0);
        setError(null);
      }
    } catch {
      setError('ERR_CONN');
      setResults([]);
      setShowDropdown(false);
    } finally {
      setIsLoading(false);
    }
  }, 300);

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const value = e.target.value.toUpperCase();
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
    setFocused(true);
    if (results.length > 0) setShowDropdown(true);
  }

  const borderCls = error
    ? 'border-red-500/40'
    : focused
    ? 'border-[#f59e0b]/35 glow-amber-border'
    : 'border-[#1a2d42]';

  return (
    <div ref={containerRef} className={`relative w-full${className ? ` ${className}` : ''}`}>

      {/* ── INPUT ── */}
      <div
        className={`flex items-center bg-[#0d1117] border transition-all duration-200 ${borderCls} ${shake ? 'animate-shake' : ''}`}
      >
        {/* Prompt */}
        <span
          className={`pl-3.5 pr-2 text-sm select-none transition-colors duration-200 ${
            focused ? 'text-[#f59e0b]' : 'text-[#3d5e7a]'
          }`}
        >
          {'>'}
        </span>

        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={handleInputChange}
          onFocus={handleInputFocus}
          onBlur={() => setFocused(false)}
          placeholder="TICKER or company name..."
          className="flex-1 py-3 pr-2 bg-transparent text-[#f59e0b] placeholder-[#2a4560] text-sm focus:outline-none tracking-wider"
        />

        {isLoading ? (
          <div className="pr-3.5">
            <span className="w-3 h-3 border border-[#f59e0b]/50 border-t-transparent rounded-full animate-spin inline-block" />
          </div>
        ) : (
          <span className="pr-3.5 text-[10px] text-[#3d5e7a] select-none">⏎</span>
        )}
      </div>

      {/* ── ERROR ── */}
      {error && (
        <div className="mt-0.5 px-3.5 py-1.5 bg-[#0d1117] border border-red-500/15">
          <span className="text-[10px] text-red-500/60 tracking-wider">
            {error === 'NO_MATCH'
              ? '// ERROR: SYMBOL NOT FOUND IN DATABASE'
              : '// ERROR: CONNECTION FAILED — RETRY'}
          </span>
        </div>
      )}

      {/* ── DROPDOWN ── */}
      {showDropdown && results.length > 0 && (
        <div className="absolute z-50 w-full mt-0.5 bg-[#09101a] border border-[#1a2d42] overflow-hidden">
          {/* Column header */}
          <div className="px-3.5 py-1.5 border-b border-[#1a2d42] flex items-center justify-between text-[9px] text-[#3d5e7a] tracking-[0.3em] select-none">
            <span>SYMBOL / NAME</span>
            <span>LAST</span>
          </div>

          {results.map((result, idx) => (
            <button
              key={result.symbol}
              type="button"
              onClick={() => handleResultClick(result)}
              className={`w-full px-3.5 py-2.5 text-left border-b border-[#0e1a28] last:border-b-0 flex items-center justify-between gap-3 transition-colors duration-100 ${
                idx === 0 ? 'bg-[#0d1928]' : 'hover:bg-[#0d1928]'
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="font-bold text-[#f59e0b] text-sm tracking-wider shrink-0 w-16 text-glow-sm">
                  {result.symbol}
                </span>
                <span className="text-[#4a6a8a] text-xs truncate">
                  {result.longname ?? result.shortname ?? ''}
                </span>
              </div>
              <span className="text-[#3d5e7a] text-xs shrink-0 tabular-nums">
                {result.currentPrice != null ? `$${result.currentPrice.toFixed(2)}` : '—'}
              </span>
            </button>
          ))}

          <div className="px-3.5 py-1 border-t border-[#1a2d42]">
            <span className="text-[9px] text-[#2a4560] select-none">↑↓ navigate · ↵ select</span>
          </div>
        </div>
      )}
    </div>
  );
}
