import { redirect } from "next/navigation";

// The operator app is the product for now; the customer storefront comes later.
export default function Home() {
  redirect("/dashboard");
}
