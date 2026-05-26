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

export interface RouteBreadcrumb {
  label: string;
  to: BreadcrumbTo;
}

declare module "@tanstack/react-router" {
  interface StaticDataRouteOption {
    breadcrumb?: RouteBreadcrumb;
  }
}

export function RouteBreadcrumbs(): ReactElement | null {
  const breadcrumbs = useRouterState({
    select: (state) =>
      state.matches
        .map((match) => match.staticData.breadcrumb)
        .filter((breadcrumb): breadcrumb is RouteBreadcrumb =>
          Boolean(breadcrumb)
        ),
  });

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
