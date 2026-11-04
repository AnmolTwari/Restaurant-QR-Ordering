'use client';

import { useState, useEffect, useCallback } from 'react';

export function useDiningSession(
  slug: string,
  tableToken?: string,
  initialSessionToken?: string,
) {
  const [sessionReady, setSessionReady] = useState(false);
  const [sessionVerifying, setSessionVerifying] = useState(true);
  const [sessionError, setSessionError] = useState<string | null>(null);

  const establishSession = useCallback(async () => {
    setSessionVerifying(true);
    setSessionError(null);

    try {
      const res = await fetch('/api/v1/public/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          restaurantSlug: slug,
          tableToken: tableToken || undefined,
          sessionToken: initialSessionToken || undefined,
        }),
      });

      const json = await res.json();

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
      setSessionReady(false);
      setSessionError('Network error establishing table session. Please check your connection.');
    } finally {
      setSessionVerifying(false);
    }
  }, [slug, tableToken, initialSessionToken]);

  useEffect(() => {
    void establishSession();
  }, [establishSession]);

  return {
    sessionReady,
    sessionVerifying,
    sessionError,
    setSessionReady,
    setSessionError,
    refreshSession: establishSession,
  };
}

