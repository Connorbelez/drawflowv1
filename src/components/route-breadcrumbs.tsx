import { Link, useRouterState } from "@tanstack/react-router";
import {
  createContext,
  Fragment,
  type ReactElement,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { FileRoutesByTo } from "#/routeTree.gen";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "./ui/breadcrumb";

type BreadcrumbTo = keyof FileRoutesByTo;
export type BreadcrumbRouteMatch = {
  params: Record<string, string | undefined>;
  routeId?: string;
  search?: Record<string, unknown>;
  loaderData?: unknown;
};
type BreadcrumbLabel =
  | string
  | ((match: BreadcrumbRouteMatch) => string | null | undefined);
type BreadcrumbValue<T> =
  | T
  | ((match: BreadcrumbRouteMatch) => T | null | undefined);

export type BreadcrumbParams = Record<string, string | undefined>;
export type BreadcrumbSearch = Record<string, unknown>;

export interface RouteBreadcrumb {
  label: BreadcrumbLabel;
  to: BreadcrumbTo;
  params?: BreadcrumbValue<BreadcrumbParams>;
  search?: BreadcrumbValue<BreadcrumbSearch>;
}

type RouteMatchWithBreadcrumb = BreadcrumbRouteMatch & {
  staticData: {
    breadcrumb?: RouteBreadcrumb;
  };
};

type ResolvedRouteBreadcrumb = Omit<RouteBreadcrumb, "label"> & {
  label: string;
};

type RouteBreadcrumbProjectionContextValue = {
  projections: Readonly<Record<string, string>>;
  setProjection: (routeId: string, label: string | undefined) => void;
};

const RouteBreadcrumbProjectionContext = createContext<
  RouteBreadcrumbProjectionContextValue | undefined
>(undefined);

const EMPTY_PROJECTIONS: RouteBreadcrumbProjectionContextValue = {
  projections: {},
  setProjection: () => undefined,
};

declare module "@tanstack/react-router" {
  interface StaticDataRouteOption {
    breadcrumb?: RouteBreadcrumb;
  }
}

export function RouteBreadcrumbs(): ReactElement | null {
  const { projections } =
    useContext(RouteBreadcrumbProjectionContext) ?? EMPTY_PROJECTIONS;
  const routeBreadcrumbs = useRouterState({
    select: (state) =>
      state.matches.map((match) => {
        const breadcrumb = resolveRouteBreadcrumb(
          match as RouteMatchWithBreadcrumb
        );
        const projectedLabel = projections[match.routeId];

        return breadcrumb && projectedLabel
          ? { ...breadcrumb, label: projectedLabel }
          : breadcrumb;
      }),
  });
  const breadcrumbs = routeBreadcrumbs.filter(
    (breadcrumb): breadcrumb is ResolvedRouteBreadcrumb => Boolean(breadcrumb)
  );

  if (breadcrumbs.length === 0) {
    return null;
  }

  return (
    <Breadcrumb>
      <BreadcrumbList>
        {breadcrumbs.map((breadcrumb, index) => {
          const isCurrentPage = index === breadcrumbs.length - 1;
          const itemClassName = isCurrentPage ? undefined : "hidden md:block";

          return (
            <Fragment key={`${breadcrumb.to}-${index}`}>
              <BreadcrumbItem className={itemClassName}>
                {isCurrentPage ? (
                  <BreadcrumbPage>{breadcrumb.label}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink
                    render={
                      <Link
                        preload="intent"
                        params={breadcrumb.params}
                        search={breadcrumb.search}
                        to={breadcrumb.to}
                        viewTransition
                      />
                    }
                  >
                    {breadcrumb.label}
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
              {!isCurrentPage && (
                <BreadcrumbSeparator className="hidden md:block" />
              )}
            </Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}

export function resolveRouteBreadcrumb(
  match: RouteMatchWithBreadcrumb
): ResolvedRouteBreadcrumb | null {
  const breadcrumb = match.staticData.breadcrumb;

  if (!breadcrumb) {
    return null;
  }

  const label =
    typeof breadcrumb.label === "function"
      ? breadcrumb.label(match)
      : breadcrumb.label;

  if (!label) {
    return null;
  }

  const params = resolveBreadcrumbValue(breadcrumb.params, match);
  const search = resolveBreadcrumbValue(breadcrumb.search, match);

  return {
    ...breadcrumb,
    label,
    ...(params ? { params } : {}),
    ...(search ? { search } : {}),
  };
}

function resolveBreadcrumbValue<T>(
  value: BreadcrumbValue<T> | undefined,
  match: BreadcrumbRouteMatch
): T | undefined {
  return typeof value === "function" ? value(match) ?? undefined : value;
}

export function RouteBreadcrumbProjectionProvider({
  children,
}: {
  children: ReactNode;
}): ReactElement {
  const [projections, setProjections] = useState<Record<string, string>>({});
  const setProjection = useCallback(
    (routeId: string, label: string | undefined) => {
      setProjections((current) => {
        if (label === undefined) {
          if (!(routeId in current)) {
            return current;
          }
          const next = { ...current };
          delete next[routeId];
          return next;
        }
        if (current[routeId] === label) {
          return current;
        }
        return { ...current, [routeId]: label };
      });
    },
    []
  );
  const contextValue = useMemo(
    () => ({ projections, setProjection }),
    [projections, setProjection]
  );

  return (
    <RouteBreadcrumbProjectionContext.Provider value={contextValue}>
      {children}
    </RouteBreadcrumbProjectionContext.Provider>
  );
}

export function useRouteBreadcrumbProjection(
  routeId: string,
  label: string | undefined
): void {
  const { setProjection } =
    useContext(RouteBreadcrumbProjectionContext) ?? EMPTY_PROJECTIONS;

  useEffect(() => {
    setProjection(routeId, label);
    return () => setProjection(routeId, undefined);
  }, [label, routeId, setProjection]);
}
