'use client';

import { useSession } from 'next-auth/react';
import NavBar from '@/components/NavBar';

/**
 * Session-aware NavBar wrapper for Server Component pages (e.g. the legal
 * pages) that can't call useSession() directly. Mirrors the
 * `<NavBar userEmail={session?.user?.email} />` pattern used by the
 * client-rendered pages.
 */
export default function SiteNav() {
  const { data: session } = useSession();
  return <NavBar userEmail={session?.user?.email} />;
}
