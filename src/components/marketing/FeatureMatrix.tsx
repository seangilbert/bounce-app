import { Check, Minus } from "@phosphor-icons/react/dist/ssr";
import { PLAN_LIST } from "@/lib/plans";
import { capabilityCell, type FeatureGroup } from "@/lib/marketing/features";

/**
 * The full capability lookup: one small table per feature group rather than a
 * single hundred-row spec sheet, so each block carries its own plan header and
 * the reader never loses which column is which while scrolling.
 *
 * Plan columns are resolved by `capabilityCell` out of `PLAN_CAPABILITIES`, so
 * this table cannot claim a feature on a plan that doesn't grant it.
 */
export function FeatureMatrix({ groups }: { groups: FeatureGroup[] }) {
  return (
    <div className="flex flex-col gap-10">
      {groups.map((group) => (
        <div key={group.id} id={group.id} className="scroll-mt-24 overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-left">
            <thead>
              <tr className="border-b border-sand">
                <th scope="col" className="pb-2.5 font-display text-lg font-bold text-ink">
                  {group.nav}
                </th>
                {PLAN_LIST.map((plan) => (
                  <th
                    key={plan.id}
                    scope="col"
                    className="w-[86px] pb-2.5 text-center text-[12.5px] font-bold uppercase tracking-wide text-ink-mute"
                  >
                    {plan.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-sand-line">
              {group.capabilities.map((cap) => (
                <tr key={cap.label}>
                  <th scope="row" className="py-2.5 pr-4 text-sm font-medium text-ink-soft">
                    {cap.label}
                    {cap.detail ? (
                      <span className="mt-0.5 block text-[12.5px] text-ink-soft">{cap.detail}</span>
                    ) : null}
                  </th>
                  {PLAN_LIST.map((plan) => {
                    const cell = capabilityCell(cap, plan.id);
                    return (
                      <td key={plan.id} className="py-2.5 text-center align-top">
                        {cell.kind === "yes" ? (
                          <>
                            <Check size={17} weight="bold" className="mx-auto text-brand" aria-hidden />
                            <span className="sr-only">Included</span>
                          </>
                        ) : cell.kind === "no" ? (
                          <>
                            <Minus size={17} weight="bold" className="mx-auto text-ink-faint" aria-hidden />
                            <span className="sr-only">Not included</span>
                          </>
                        ) : (
                          <span className="text-[13px] font-bold text-ink">{cell.text}</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
