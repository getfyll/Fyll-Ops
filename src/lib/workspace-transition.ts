// A session change must not overlap requests made with the previous identity.
let generation = 0;
let blocked = false;
const pending = new Set<Promise<unknown>>();

export const workspaceGeneration = () => generation;
export const isWorkspaceTransitioning = () => blocked;

export async function beginWorkspaceTransition() {
  if (blocked) throw new Error('A business switch is already in progress.');
  blocked = true;
  generation += 1;
  // Drain requests already sent before replacing the authenticated session.
  const timeout = new Promise<never>((_, reject) => {
    const timer = setTimeout(() => reject(new Error('Still saving changes. Please try again in a moment.')), 15000);
    Promise.allSettled([...pending]).finally(() => clearTimeout(timer));
  });
  try {
    await Promise.race([Promise.allSettled([...pending]), timeout]);
  } catch (error) {
    blocked = false;
    throw error;
  }
}

export const endWorkspaceTransition = () => { blocked = false; };

export const workspaceFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  // Auth must remain available so the verified replacement session can be installed.
  if (url.includes('/auth/v1/')) return fetch(input, init);
  if (blocked) throw new Error('Business switch in progress.');
  const requestGeneration = generation;
  const request = (async () => {
    const response = await fetch(input, init);
    // Consume the body before releasing the barrier; callers receive their own response.
    const body = await response.arrayBuffer();
    if (requestGeneration !== generation) throw new Error('Discarded response from previous business.');
    return new Response(body.byteLength ? body : null, {
      status: response.status, statusText: response.statusText, headers: response.headers,
    });
  })();
  pending.add(request);
  try { return await request; } finally { pending.delete(request); }
};
