import { Link, useRouterState } from "@tanstack/react-router";
import { Fragment, type ReactElement } from "react";
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
type BreadcrumbRouteMatch = {
  params: Record<string, string | undefined>;
};
type BreadcrumbLabel =
  | string
  | ((match: BreadcrumbRouteMatch) => string | null | undefined);

export interface RouteBreadcrumb {
  label: BreadcrumbLabel;
  to: BreadcrumbTo;
}

type RouteMatchWithBreadcrumb = BreadcrumbRouteMatch & {
  staticData: {
    breadcrumb?: RouteBreadcrumb;
  };
};

type ResolvedRouteBreadcrumb = Omit<RouteBreadcrumb, "label"> & {
  label: string;
};

declare module "@tanstack/react-router" {
  interface StaticDataRouteOption {
    breadcrumb?: RouteBreadcrumb;
  }
}

export function RouteBreadcrumbs(): ReactElement | null {
  const routeBreadcrumbs = useRouterState({
    select: (state) =>
      state.matches.map((match) =>
        resolveRouteBreadcrumb(match as RouteMatchWithBreadcrumb)
      ),
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

  return {
    ...breadcrumb,
    label,
  };
}
