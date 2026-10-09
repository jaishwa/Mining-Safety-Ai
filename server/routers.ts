import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { simulationEngine, type SimulationAction } from "./simulation";
import { z } from "zod";

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  safety: router({
    snapshot: publicProcedure.query(() => simulationEngine.snapshot()),
    control: publicProcedure
      .input(z.object({ action: z.enum(["start", "pause", "reset", "step"]) }))
      .mutation(({ input }) => simulationEngine.control(input.action as SimulationAction)),
    acknowledge: publicProcedure
      .input(z.object({ alertId: z.string() }))
      .mutation(({ input }) => simulationEngine.acknowledge(input.alertId)),
  }),
});

export type AppRouter = typeof appRouter;
