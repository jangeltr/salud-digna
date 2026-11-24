import { createOmnichannelHandler } from "../../../omnichannel/server";

export const runtime = "nodejs";
export const POST = createOmnichannelHandler("ADMIN", "ADMIN_ORCHESTRATOR_API_KEY");
