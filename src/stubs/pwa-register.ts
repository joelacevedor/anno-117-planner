// Sustituto para la versión de un solo archivo (sin service worker).
export function useRegisterSW() {
  return { needRefresh: [false, () => {}] as const, offlineReady: [false, () => {}] as const, updateServiceWorker: async (_reload?: boolean) => {} };
}
