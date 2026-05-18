'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useDebouncedCallback } from 'use-debounce';
import { useRouter } from 'next/navigation';
import type { TickerSearchResult } from '@/lib/types';

interface TickerSearchProps {
  className?: string;
  /** Button label — "Research" on the landing, "Decipher" on the terminal. */
  cta?: string;
  autoFocus?: boolean;
}

export default function TickerSearch({ className, cta = 'Research', autoFocus }: TickerSearchProps) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<TickerSearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [shake, setShake] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
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

  const goToResult = useCallback(
    (result: TickerSearchResult) => {
      setShowDropdown(false);
      setQuery('');
      router.push(`/research/${result.symbol}`);
    },
    [router],
  );

  function submit() {
    if (results[0]) {
      goToResult(results[0]);
    } else if (query.trim()) {
      router.push(`/research/${encodeURIComponent(query.trim().toUpperCase())}`);
    } else {
      triggerShake();
    }
  }

  return (
    <div ref={containerRef} className={className}>
      <div className={`search-shell${shake ? ' shake' : ''}`}>
        <span className="icon">⌕</span>
        <input
          autoFocus={autoFocus}
          type="text"
          value={query}
          onChange={handleInputChange}
          onFocus={() => { if (results.length > 0) setShowDropdown(true); }}
          placeholder="Search a symbol or company — AAPL, Tesla, JPMorgan…"
          aria-label="Ticker search"
          onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
        />
        <button type="button" onClick={submit}>
          {isLoading ? (
            <span
              className="inline-block w-3 h-3 rounded-full animate-spin"
              style={{ border: '2px solid currentColor', borderTopColor: 'transparent' }}
            />
          ) : (
            <>
              {cta} <span style={{ marginLeft: '2px' }}>→</span>
            </>
          )}
        </button>
      </div>

      {error && (
        <div
          className="mt-1.5 px-3.5 py-1.5"
          style={{
            background: 'var(--rose-soft)',
            border: '1px solid var(--rose)',
            borderRadius: 'var(--radius)',
          }}
        >
          <span className="font-mono text-[10px] tracking-wider" style={{ color: 'var(--rose)' }}>
            {error === 'NO_MATCH'
              ? '// SYMBOL NOT FOUND IN DATABASE'
              : '// CONNECTION FAILED — RETRY'}
          </span>
        </div>
      )}

      {showDropdown && results.length > 0 && (
        <div className="suggest">
          {results.map((result) => (
            <div key={result.symbol} className="suggest-row" onClick={() => goToResult(result)}>
              <span className="sym">{result.symbol}</span>
              <span className="nm">{result.longname ?? result.shortname ?? ''}</span>
              <span className="sc">
                {result.currentPrice != null ? `$${result.currentPrice.toFixed(2)}` : '—'}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
