import StaffPage from "./staff-page";

export const dynamic = "force-dynamic";

export default function Page() {
  const enabled = Boolean(process.env.ADMIN_ORCHESTRATOR_API_KEY) &&
    (process.env.NODE_ENV === "development" || Boolean(process.env.STAFF_FRONTEND_ORIGIN && process.env.GENERAL_API_ORIGIN));
  return <StaffPage enabled={enabled} />;
}
