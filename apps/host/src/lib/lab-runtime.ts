import { useEffect, useState } from 'react';

/** The host checks Lab's bound instance; never accept a standalone model as fallback. */
export async function readLabRuntime(): Promise<{loaded: boolean; modelId?: string}> {
  try {
    const response = await fetch('/api/lab/runtime', {redirect:'error', cache:'no-store', signal:AbortSignal.timeout(2500)});
    const value = response.ok ? await response.json() : null;
    return value?.managed === true && value?.loaded === true && typeof value.modelId === 'string' && value.modelId
      ? {loaded:true, modelId:value.modelId} : {loaded:false};
  } catch { return {loaded:false}; }
}

/** Display only Lab's currently owned runtime; this hook cannot launch or select one. */
export function useLabRuntime() {
  const [state, setState] = useState<{loaded: boolean; modelId?: string} | null>(null);
  useEffect(() => {
    if (document.documentElement.dataset.labManaged !== '1') return;
    let closed = false;
    const refresh = async () => {
      const value = await readLabRuntime();
      if (!closed) {
        setState(value);
        const banner = document.querySelector('[data-lab-runtime]');
        if (banner) banner.textContent = value.loaded ? `Active model: ${value.modelId}. Bounded qualification only.` : 'No Lab runtime is ready.';
      }
    };
    void refresh();
    const timer = setInterval(refresh, 2500);
    return () => {closed = true; clearInterval(timer);};
  }, []);
  return state;
}
