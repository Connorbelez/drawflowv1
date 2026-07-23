import type { Auth, UserIdentity } from "convex/server";
import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { createBuilder } from "fluent-convex";
import { WithZod } from "fluent-convex/zod";
import { z } from "zod/v4";

import type { DataModel } from "./_generated/dataModel";

export const fluent = createBuilder<DataModel>();

export const todoValidator = v.object({
  _id: v.id("todos"),
  _creationTime: v.number(),
  text: v.string(),
  completed: v.boolean(),
});

const viewerValidator = v.object({
  tokenIdentifier: v.string(),
  issuer: v.string(),
  name: v.optional(v.string()),
  email: v.optional(v.string()),
});

interface Viewer {
  email?: string;
  issuer: string;
  name?: string;
  tokenIdentifier: string;
}

function toViewer(identity: UserIdentity): Viewer {
  const viewer: Viewer = {
    tokenIdentifier: identity.tokenIdentifier,
    issuer: identity.issuer,
  };

  if (identity.name) {
    viewer.name = identity.name;
  }
  if (identity.email) {
    viewer.email = identity.email;
  }

  return viewer;
}

export const requireIdentity = fluent
  .$context<{ auth: Auth }>()
  .createMiddleware(async (ctx, next) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthorized");
    }

    return next({
      ...ctx,
      viewer: toViewer(identity),
    });
  });

export function withQueryTiming(operation: string) {
  return fluent.query().createMiddleware(async (ctx, next) => {
    const startedAt = Date.now();
    try {
      return await next(ctx);
    } finally {
      console.info(
        `[convex] query ${operation} completed in ${Date.now() - startedAt}ms`
      );
    }
  });
}

export function withMutationTiming(operation: string) {
  return fluent.mutation().createMiddleware(async (ctx, next) => {
    const startedAt = Date.now();
    try {
      return await next(ctx);
    } finally {
      console.info(
        `[convex] mutation ${operation} completed in ${Date.now() - startedAt}ms`
      );
    }
  });
}

export function withActionTiming(operation: string) {
  return fluent.action().createMiddleware(async (ctx, next) => {
    const startedAt = Date.now();
    try {
      return await next(ctx);
    } finally {
      console.info(
        `[convex] action ${operation} completed in ${Date.now() - startedAt}ms`
      );
    }
  });
}

export const publicQuery = fluent.query();
export const publicMutation = fluent.mutation();
export const publicAction = fluent.action();
export const internalMutation = fluent.mutation();
export const internalQuery = fluent.query();
export const internalAction = fluent.action();

export const publicZodQuery = publicQuery.extend(WithZod);
export const publicZodMutation = publicMutation.extend(WithZod);
export const publicZodAction = publicAction.extend(WithZod);

export const authenticatedQuery = publicQuery.use(requireIdentity);
export const authenticatedMutation = publicMutation.use(requireIdentity);
export const authenticatedAction = publicAction.use(requireIdentity);

export const authenticatedZodQuery = authenticatedQuery.extend(WithZod);
export const authenticatedZodMutation = authenticatedMutation.extend(WithZod);
export const authenticatedZodAction = authenticatedAction.extend(WithZod);

const getViewer = authenticatedQuery
  .returns(viewerValidator)
  .handler(async (ctx) => ctx.viewer);

export const viewer = getViewer.use(withQueryTiming("fluent.viewer")).public();

const listRecentTodos = publicQuery
  .input({
    paginationOpts: paginationOptsValidator,
  })
  .returns(
    v.object({
      page: v.array(todoValidator),
      isDone: v.boolean(),
      continueCursor: v.string(),
    })
  )
  .handler(
    async (ctx, args) =>
      await ctx.db.query("todos").order("desc").paginate(args.paginationOpts)
  );

export const listTodosPage = listRecentTodos
  .use(withQueryTiming("fluent.listTodosPage"))
  .public();

export const listTodoTexts = publicZodQuery
  .use(withQueryTiming("fluent.listTodoTexts"))
  .input(
    z.object({
      limit: z.number().int().min(1).max(100),
    })
  )
  .returns(v.array(v.string()))
  .handler(async (ctx, args) => {
    const rows = await ctx.db.query("todos").order("desc").take(args.limit);

    return rows.map((todo) => todo.text);
  })
  .public();

export const addTodoForViewer = authenticatedZodMutation
  .use(withMutationTiming("fluent.addTodoForViewer"))
  .input(
    z.object({
      text: z.string().trim().min(1).max(280),
    })
  )
  .returns(v.id("todos"))
  .handler(async (ctx, args) => {
    console.info(
      `[convex] viewer ${ctx.viewer.tokenIdentifier} created a todo`
    );

    return await ctx.db.insert("todos", {
      text: args.text,
      completed: false,
    });
  })
  .public();

export const ping = publicZodAction
  .use(withActionTiming("fluent.ping"))
  .input(
    z.object({
      url: z.url(),
    })
  )
  .returns(
    v.object({
      ok: v.boolean(),
      status: v.number(),
    })
  )
  .handler(async (_ctx, args) => {
    const response = await fetch(args.url, { method: "HEAD" });

    return {
      ok: response.ok,
      status: response.status,
    };
  })
  .public();
