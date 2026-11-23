import { notFound } from "next/navigation";
import { AdminConsole } from "../../components/admin-console";

export default function Design() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <AdminConsole />;
}
