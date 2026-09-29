import type { Metadata } from "next";
import { DemoWizard } from "./wizard";

export const metadata: Metadata = { title: "Demo wizard · toolrail" };

export default function DemoPage() {
  return <DemoWizard />;
}
