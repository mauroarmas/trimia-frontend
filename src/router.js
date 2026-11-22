import { useEffect, useState, useCallback } from 'react';

export const TAB_TO_SLUG = {
  supervisor: 'supervisor',
  escalations: 'escalados',
  knowledge: 'conocimiento',
  employees: 'empleados',
  training: 'capacitacion',
  collections: 'cobranzas',
  sales: 'ventas',
  admin_financing: 'financiacion',
  chat: 'simulador',
  webchat: 'asistente',
};

export const SLUG_TO_TAB = Object.fromEntries(
  Object.entries(TAB_TO_SLUG).map(([k, v]) => [v, k]),
);

export const SUBTAB_TO_SLUG = {
  sales: {
    prospects: 'prospectos',
    stock: 'stock',
    credit_check: 'credito',
    commercial_orders: 'cierres',
    close_sale: 'cierre-manual',
    new_client: 'alta-cuotas',
  },
  collections: {
    proofs: 'comprobantes',
    impact: 'impacto',
    clients: 'clientes',
    reminders: 'recordatorios',
    'reminder-config': 'configuracion-recordatorios',
    activity: 'actividad',
  },
  admin_financing: {
    PENDING_REVIEW: 'pendientes',
    APPROVED: 'aprobadas',
    REJECTED: 'rechazadas',
    CANCELLED: 'canceladas',
    ALL: 'todas',
  },
};

export const DEFAULT_SUBTAB_BY_TAB = {
  sales: 'prospects',
  collections: 'proofs',
  admin_financing: 'PENDING_REVIEW',
};

const SLUG_TO_SUBTAB = Object.fromEntries(
  Object.entries(SUBTAB_TO_SLUG).map(([tabId, map]) => [
    tabId,
    Object.fromEntries(Object.entries(map).map(([subId, slug]) => [slug, subId])),
  ]),
);

export function parseRouteFromLocation(pathname = window.location.pathname) {
  const clean = String(pathname || '')
    .replace(/^\/+|\/+$/g, '')
    .split('/')
    .filter(Boolean);

  // Soporta tanto /panel/<seccion>/<subseccion> como /<seccion>/<subseccion>
  const parts = clean[0] === 'panel' ? clean.slice(1) : clean;
  const tabSlug = parts[0] || '';
  const subSlug = parts[1] || '';

  const tabId = SLUG_TO_TAB[tabSlug] || null;
  if (!tabId) {
    return { tab: null, subtab: null };
  }

  const subMap = SLUG_TO_SUBTAB[tabId];
  const subtab = subMap ? subMap[subSlug] || null : null;
  return { tab: tabId, subtab };
}

export function buildPathForRoute(tabId, subtabId) {
  const tabSlug = TAB_TO_SLUG[tabId];
  if (!tabSlug) return '/panel';
  const subMap = SUBTAB_TO_SLUG[tabId];
  if (subMap && subtabId && subMap[subtabId]) {
    return `/panel/${tabSlug}/${subMap[subtabId]}`;
  }
  return `/panel/${tabSlug}`;
}

export function navigateToRoute(tabId, subtabId, { replace = false } = {}) {
  if (typeof window === 'undefined') return;
  const nextPath = buildPathForRoute(tabId, subtabId);
  if (window.location.pathname === nextPath) return;
  if (replace) {
    window.history.replaceState({ tab: tabId, subtab: subtabId }, '', nextPath);
  } else {
    window.history.pushState({ tab: tabId, subtab: subtabId }, '', nextPath);
  }
}

export function useSubtabRoute(tabId, validSubtabs, defaultSubtab) {
  const [activeSubtab, setActiveSubtabState] = useState(() => {
    const parsed = parseRouteFromLocation();
    if (parsed.tab === tabId && parsed.subtab && validSubtabs.includes(parsed.subtab)) {
      return parsed.subtab;
    }
    return defaultSubtab;
  });

  useEffect(() => {
    const parsed = parseRouteFromLocation();
    if (parsed.tab === tabId) {
      const targetSub =
        parsed.subtab && validSubtabs.includes(parsed.subtab)
          ? parsed.subtab
          : activeSubtab || defaultSubtab;
      navigateToRoute(tabId, targetSub, { replace: true });
    }
  }, [tabId, validSubtabs, defaultSubtab, activeSubtab]);

  useEffect(() => {
    function handlePopState() {
      const parsed = parseRouteFromLocation();
      if (parsed.tab === tabId && parsed.subtab && validSubtabs.includes(parsed.subtab)) {
        setActiveSubtabState(parsed.subtab);
      }
    }
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [tabId, validSubtabs]);

  const setActiveSubtab = useCallback(
    (nextOrUpdater) => {
      setActiveSubtabState((prev) => {
        const resolved =
          typeof nextOrUpdater === 'function'
            ? nextOrUpdater(prev)
            : nextOrUpdater;
        if (typeof resolved === 'string') {
          navigateToRoute(tabId, resolved, { replace: false });
        }
        return resolved;
      });
    },
    [tabId],
  );

  return [activeSubtab, setActiveSubtab];
}
