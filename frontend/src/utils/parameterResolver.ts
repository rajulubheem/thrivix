export async function resolveUserInputsInParams(params: any): Promise<{ ok: boolean; params?: any; error?: string }>{
  try {
    if (params == null || typeof params !== 'object') return { ok: true, params };
    const out: any = Array.isArray(params) ? [...params] : { ...params };

    const processValue = async (val: any): Promise<{ val?: any; error?: string }> => {
      if (typeof val === 'string') {
        // ${USER_FILE:default}
        const m = val.match(/\$\{USER_FILE:([^}]+)\}/);
        if (m) {
          const suggested = m[1];
          const input = window.prompt(`Provide a file path for ${suggested}`, suggested || '') ?? '';
          const trimmed = input.trim();
          if (!trimmed) {
            return { error: `File path required for ${suggested}` };
          }
          return { val: trimmed };
        }
      }
      return { val };
    };

    if (Array.isArray(out)) {
      for (let i = 0; i < out.length; i++) {
        const { val, error } = await processValue(out[i]);
        if (error) return { ok: false, error };
        out[i] = val;
      }
    } else {
      for (const k of Object.keys(out)) {
        const { val, error } = await processValue(out[k]);
        if (error) return { ok: false, error };
        out[k] = val;
      }
    }

    return { ok: true, params: out };
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Failed to resolve inputs' };
  }
}

