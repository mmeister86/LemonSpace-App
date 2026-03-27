import { ManageSubscription } from "@/components/billing/manage-subscription";
import { PricingCards } from "@/components/billing/pricing-cards";
import { TopupPanel } from "@/components/billing/topup-panel";

export default function BillingPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-10 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Billing</h1>
        <p className="mt-1 text-muted-foreground">Manage your plan and credits</p>
      </div>

      <section className="space-y-4">
        <h2 className="text-lg font-medium">Current plan</h2>
        <ManageSubscription />
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-medium">Change plan</h2>
        <PricingCards />
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-medium">Buy credits</h2>
        <TopupPanel />
      </section>
    </div>
  );
}
