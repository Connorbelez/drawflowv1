import { v } from "convex/values";
import { z } from "zod/v4";

import {
  publicMutation,
  publicQuery,
  publicZodMutation,
  todoValidator,
  withMutationTiming,
  withQueryTiming,
} from "./fluent";

export const list = publicQuery
  .use(withQueryTiming("todos.list"))
  .returns(v.array(todoValidator))
  .handler(async (ctx) => await ctx.db.query("todos").order("desc").take(100))
  .public();

export const add = publicZodMutation
  .use(withMutationTiming("todos.add"))
  .input(
    z.object({
      text: z.string().trim().min(1).max(280),
    })
  )
  .returns(v.id("todos"))
  .handler(
    async (ctx, args) =>
      await ctx.db.insert("todos", {
        text: args.text,
        completed: false,
      })
  )
  .public();

export const toggle = publicMutation
  .use(withMutationTiming("todos.toggle"))
  .input({ id: v.id("todos") })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const todo = await ctx.db.get(args.id);
    if (!todo) {
      throw new Error("Todo not found");
    }
    await ctx.db.patch(args.id, {
      completed: !todo.completed,
    });
    return null;
  })
  .public();

export const remove = publicMutation
  .use(withMutationTiming("todos.remove"))
  .input({ id: v.id("todos") })
  .returns(v.null())
  .handler(async (ctx, args) => {
    await ctx.db.delete(args.id);
    return null;
  })
  .public();
