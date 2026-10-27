import { useEffect, useState } from 'react';

/** Display only Lab's currently owned runtime; this hook cannot launch or select one. */
export function useLabRuntime() {
  const [state, setState] = useState<{loaded: boolean; modelId?: string} | null>(null);
  useEffect(() => {
    if (document.documentElement.dataset.labManaged !== '1') return;
    let closed = false;
    const refresh = async () => {
      try {
        const response = await fetch('/api/lab/runtime', {redirect:'error'});
        const value = response.ok ? await response.json() : null;
        if (!closed) {
          setState(value?.managed === true && value?.loaded === true ? value : {loaded:false});
          const banner = document.querySelector('[data-lab-runtime]');
          if (banner) banner.textContent = value?.loaded === true ? `Active model: ${value.modelId}. Bounded qualification only.` : 'No Lab runtime is ready.';
        }
      } catch {if (!closed) setState({loaded:false});}
    };
    void refresh();
    const timer = setInterval(refresh, 2500);
    return () => {closed = true; clearInterval(timer);};
  }, []);
  return state;
}
