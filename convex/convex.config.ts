import agent from "@convex-dev/agent/convex.config";
import presence from "@convex-dev/presence/convex.config";
import workOSAuthKit from "@convex-dev/workos-authkit/convex.config";
import { defineApp } from "convex/server";
import timeline from "convex-timeline/convex.config";

const app = defineApp();
app.use(agent);
app.use(workOSAuthKit);
app.use(presence);
app.use(timeline);

export default app;
