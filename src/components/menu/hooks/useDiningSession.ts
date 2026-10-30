'use client';

import { useState, useEffect } from 'react';

export function useDiningSession(slug: string, tableToken?: string) {
  const [sessionReady, setSessionReady] = useState(false);
  const [sessionVerifying, setSessionVerifying] = useState(true);
  const [sessionError, setSessionError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    setSessionVerifying(true);
    setSessionError(null);

    async function establishSession() {
      try {
        const res = await fetch('/api/v1/public/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            restaurantSlug: slug,
            tableToken: tableToken || undefined,
          }),
        });

        const json = await res.json();
        if (!isMounted) return;

        if (res.ok && json.success && json.data?.valid) {
          setSessionReady(true);
          setSessionError(null);
        } else {
          setSessionReady(false);
          setSessionError(
            json.error?.message ||
              'Your table session is invalid, expired, or belongs to another restaurant. Please rescan your table QR code.',
          );
        }
      } catch {
        if (!isMounted) return;
        setSessionReady(false);
        setSessionError('Network error establishing table session. Please check your connection.');
      } finally {
        if (isMounted) setSessionVerifying(false);
      }
    }

    void establishSession();
    return () => {
      isMounted = false;
    };
  }, [slug, tableToken]);

  return {
    sessionReady,
    sessionVerifying,
    sessionError,
    setSessionReady,
    setSessionError,
  };
}

