import { notFound } from "next/navigation";
import { Console } from "../../components/console";

export default function DesignPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <Console />;
}
