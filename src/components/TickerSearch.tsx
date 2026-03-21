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
    ? 'border-error/40'
    : focused
    ? 'border-primary/35 ring-1 ring-primary-container/60'
    : 'border-outline-variant';

  return (
    <div ref={containerRef} className={`relative w-full${className ? ` ${className}` : ''}`}>

      {/* ── INPUT ── */}
      <div
        className={`flex items-center bg-surface-container-high border transition-all duration-200 ${borderCls} ${shake ? 'animate-shake' : ''}`}
      >
        {/* Prompt */}
        <span
          className={`pl-3.5 pr-2 text-sm select-none transition-colors duration-200 ${
            focused ? 'text-primary' : 'text-outline'
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
          className="flex-1 py-3 pr-2 bg-transparent text-primary placeholder-outline/40 text-sm focus:outline-none tracking-wider"
        />

        {isLoading ? (
          <div className="pr-3.5">
            <span className="w-3 h-3 border border-primary/50 border-t-transparent rounded-full animate-spin inline-block" />
          </div>
        ) : (
          <span className="pr-3.5 text-[10px] text-outline select-none">⏎</span>
        )}
      </div>

      {/* ── ERROR ── */}
      {error && (
        <div className="mt-0.5 px-3.5 py-1.5 bg-surface-container-high border border-error/15">
          <span className="text-[10px] text-error/60 tracking-wider">
            {error === 'NO_MATCH'
              ? '// ERROR: SYMBOL NOT FOUND IN DATABASE'
              : '// ERROR: CONNECTION FAILED — RETRY'}
          </span>
        </div>
      )}

      {/* ── DROPDOWN ── */}
      {showDropdown && results.length > 0 && (
        <div className="absolute z-50 w-full mt-0.5 bg-surface-container-high border border-outline-variant overflow-hidden">
          {/* Column header */}
          <div className="px-3.5 py-1.5 border-b border-outline-variant/40 flex items-center justify-between text-[9px] text-outline tracking-[0.3em] select-none">
            <span>SYMBOL / NAME</span>
            <span>LAST</span>
          </div>

          {results.map((result, idx) => (
            <button
              key={result.symbol}
              type="button"
              onClick={() => handleResultClick(result)}
              className={`w-full px-3.5 py-2.5 text-left border-b border-outline-variant/20 last:border-b-0 flex items-center justify-between gap-3 transition-colors duration-100 ${
                idx === 0 ? 'bg-surface-container-highest' : 'hover:bg-surface-container-highest'
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="font-bold text-primary text-sm tracking-wider shrink-0 w-16">
                  {result.symbol}
                </span>
                <span className="text-on-surface-variant text-xs truncate">
                  {result.longname ?? result.shortname ?? ''}
                </span>
              </div>
              <span className="text-outline text-xs shrink-0 tabular-nums">
                {result.currentPrice != null ? `$${result.currentPrice.toFixed(2)}` : '—'}
              </span>
            </button>
          ))}

          <div className="px-3.5 py-1 border-t border-outline-variant/40">
            <span className="text-[9px] text-outline/60 select-none">↑↓ navigate · ↵ select</span>
          </div>
        </div>
      )}
    </div>
  );
}
