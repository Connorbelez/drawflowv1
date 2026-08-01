import agent from "@convex-dev/agent/convex.config";
import migrations from "@convex-dev/migrations/convex.config.js";
import presence from "@convex-dev/presence/convex.config";
import resend from "@convex-dev/resend/convex.config.js";
import workOSAuthKit from "@convex-dev/workos-authkit/convex.config";
import { defineApp } from "convex/server";
import timeline from "convex-timeline/convex.config";

const app = defineApp();
app.use(agent);
app.use(migrations);
app.use(workOSAuthKit);
app.use(presence);
app.use(resend);
app.use(timeline);

export default app;
