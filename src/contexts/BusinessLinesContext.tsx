'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';
import {
  BusinessLine,
  DEFAULT_BUSINESS_LINES,
  fetchAgentBusinessLines,
  updateAgentBusinessLines
} from '@/lib/auth/businessLines';

interface BusinessLinesContextType {
  businessLines: BusinessLine[];
  loading: boolean;
  isLineEnabled: (line: BusinessLine) => boolean;
  saveBusinessLines: (lines: BusinessLine[]) => Promise<void>;
  reloadBusinessLines: () => Promise<void>;
}

const BusinessLinesContext = createContext<BusinessLinesContextType>({
  businessLines: DEFAULT_BUSINESS_LINES,
  loading: true,
  isLineEnabled: () => true,
  saveBusinessLines: async () => {},
  reloadBusinessLines: async () => {}
});

export function BusinessLinesProvider({ children }: { children: React.ReactNode }) {
  const [userId, setUserId] = useState<string | null>(null);
  const [businessLines, setBusinessLines] = useState<BusinessLine[]>(DEFAULT_BUSINESS_LINES);
  const [loading, setLoading] = useState<boolean>(true);

  const loadLines = useCallback(async (uid: string) => {
    setLoading(true);
    try {
      const lines = await fetchAgentBusinessLines(uid);
      console.log('[BusinessLinesContext] Loaded lines for user:', uid, lines);
      setBusinessLines(lines);
    } catch (err) {
      console.error('[BusinessLinesContext] Failed to load business lines:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user?.id && isMounted) {
        setUserId(session.user.id);
        await loadLines(session.user.id);
      } else if (isMounted) {
        setLoading(false);
      }
    };

    init();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user?.id && isMounted) {
        setUserId(session.user.id);
        await loadLines(session.user.id);
      } else if (isMounted) {
        setUserId(null);
        setBusinessLines(DEFAULT_BUSINESS_LINES);
        setLoading(false);
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [loadLines]);

  const isLineEnabled = useCallback((line: BusinessLine): boolean => {
    return businessLines.includes(line);
  }, [businessLines]);

  const saveLines = useCallback(async (lines: BusinessLine[]): Promise<void> => {
    if (!userId) {
      throw new Error('User is not authenticated.');
    }
    const saved = await updateAgentBusinessLines(userId, lines);
    setBusinessLines(saved);
  }, [userId]);

  const reloadLines = useCallback(async (): Promise<void> => {
    if (userId) {
      await loadLines(userId);
    }
  }, [userId, loadLines]);

  return (
    <BusinessLinesContext.Provider value={{
      businessLines,
      loading,
      isLineEnabled,
      saveBusinessLines: saveLines,
      reloadBusinessLines: reloadLines
    }}>
      {children}
    </BusinessLinesContext.Provider>
  );
}

export function useBusinessLines() {
  return useContext(BusinessLinesContext);
}
