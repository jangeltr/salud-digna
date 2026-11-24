import { createOmnichannelHandler } from "../../../omnichannel/server";

export const runtime = "nodejs";
export const POST = createOmnichannelHandler("ADVISOR", "CALL_CENTER_ORCHESTRATOR_API_KEY");
