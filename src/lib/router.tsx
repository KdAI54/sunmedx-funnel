import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type AnchorHTMLAttributes,
} from 'react';

export interface NavigateOptions {
  to: string;
  search?: Record<string, string | undefined>;
  hash?: string;
  replace?: boolean;
}

interface RouterContextValue {
  pathname: string;
  search: Record<string, string>;
  hash: string;
  navigate: (opts: NavigateOptions | string) => void;
}

const RouterContext = createContext<RouterContextValue | null>(null);

function parseLocation() {
  if (typeof window === 'undefined') {
    return { pathname: '/', search: {}, hash: '' };
  }
  const params: Record<string, string> = {};
  const sp = new URLSearchParams(window.location.search);
  sp.forEach((v, k) => {
    params[k] = v;
  });
  return {
    pathname: window.location.pathname || '/',
    search: params,
    hash: window.location.hash.replace(/^#/, ''),
  };
}

export function buildHref(
  to: string,
  search?: Record<string, string | undefined>,
  hash?: string
): string {
  const sp = new URLSearchParams();
  if (search) {
    for (const [k, v] of Object.entries(search)) {
      if (v !== undefined && v !== '') sp.set(k, v);
    }
  }
  const qs = sp.toString();
  const hashPart = hash ? `#${hash}` : '';
  return `${to}${qs ? `?${qs}` : ''}${hashPart}`;
}

export function RouterProvider({ children }: { children: React.ReactNode }) {
  const [loc, setLoc] = useState(parseLocation);

  useEffect(() => {
    const onPop = () => setLoc(parseLocation());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const navigate = useCallback((opts: NavigateOptions | string) => {
    const target = typeof opts === 'string' ? { to: opts } : opts;
    const url = buildHref(target.to, target.search, target.hash);
    if (target.replace) {
      window.history.replaceState(null, '', url);
    } else {
      window.history.pushState(null, '', url);
    }
    setLoc(parseLocation());
    if (target.hash) {
      requestAnimationFrame(() => {
        const el = document.getElementById(target.hash!);
        el?.scrollIntoView({ behavior: 'smooth' });
      });
    }
  }, []);

  return (
    <RouterContext.Provider value={{ ...loc, navigate }}>
      {children}
    </RouterContext.Provider>
  );
}

export function useRouter() {
  const ctx = useContext(RouterContext);
  if (!ctx) throw new Error('useRouter must be used inside RouterProvider');
  return ctx;
}

interface LinkProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> {
  to: string;
  search?: Record<string, string | undefined>;
  hash?: string;
}

export const Link = React.forwardRef<HTMLAnchorElement, LinkProps>(
  ({ to, search, hash, onClick, children, ...rest }, ref) => {
    const { navigate } = useRouter();
    const href = buildHref(to, search, hash);

    return (
      <a
        ref={ref}
        href={href}
        onClick={(e) => {
          onClick?.(e);
          if (
            e.defaultPrevented ||
            e.metaKey ||
            e.ctrlKey ||
            e.shiftKey ||
            e.altKey ||
            e.button !== 0
          ) {
            return;
          }
          e.preventDefault();
          navigate({ to, search, hash });
        }}
        {...rest}
      >
        {children}
      </a>
    );
  }
);
Link.displayName = 'Link';
