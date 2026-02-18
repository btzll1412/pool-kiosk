import { CreditCard, Snowflake, Waves } from "lucide-react";

export default function MemberCard({ member }) {
  const initials = `${member.first_name?.[0] || ""}${member.last_name?.[0] || ""}`.toUpperCase();
  const fullName = `${member.first_name} ${member.last_name}`;
  const membership = member.active_membership;

  let statusColor = "bg-emerald-500";
  let statusText = "Active";
  let statusDetail = "";

  if (member.is_frozen) {
    statusColor = "bg-blue-500";
    statusText = "Frozen";
    statusDetail = member.frozen_until ? `Until ${member.frozen_until}` : "Until further notice";
  } else if (!membership) {
    statusColor = "bg-amber-500";
    statusText = "No Active Plan";
    statusDetail = "Purchase a plan to swim";
  } else if (membership.plan_type === "monthly") {
    statusDetail = `Valid until ${membership.valid_until}`;
  } else if (membership.plan_type === "swim_pass") {
    statusDetail = `${membership.swims_remaining} swim${membership.swims_remaining !== 1 ? "s" : ""} remaining`;
    if (membership.swims_remaining <= 2) {
      statusColor = "bg-amber-500";
    }
  }

  return (
    <div className="rounded-2xl bg-white p-6 shadow-lg ring-1 ring-gray-100">
      <div className="flex items-center gap-5">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-brand-100 text-2xl font-bold text-brand-700">
          {initials}
        </div>
        <div className="flex-1">
          <h2 className="text-2xl font-bold text-gray-900">{fullName}</h2>
          <div className="mt-1 flex items-center gap-2">
            <div className={`h-2.5 w-2.5 rounded-full ${statusColor}`} />
            <span className="text-lg font-medium text-gray-600">{statusText}</span>
          </div>
          {statusDetail && (
            <p className="mt-0.5 text-sm text-gray-500">{statusDetail}</p>
          )}
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3">
        {membership && (
          <div className="flex items-center gap-3 rounded-xl bg-brand-50 px-4 py-3">
            <Waves className="h-5 w-5 text-brand-600" />
            <div>
              <p className="text-xs text-brand-600">Plan</p>
              <p className="text-sm font-semibold text-brand-900">{membership.plan_name}</p>
            </div>
          </div>
        )}
        <div className="flex items-center gap-3 rounded-xl bg-emerald-50 px-4 py-3">
          <CreditCard className="h-5 w-5 text-emerald-600" />
          <div>
            <p className="text-xs text-emerald-600">Credit Balance</p>
            <p className="text-sm font-semibold text-emerald-900">
              ${Number(member.credit_balance || 0).toFixed(2)}
            </p>
          </div>
        </div>
        {member.is_frozen && (
          <div className="flex items-center gap-3 rounded-xl bg-blue-50 px-4 py-3">
            <Snowflake className="h-5 w-5 text-blue-600" />
            <div>
              <p className="text-xs text-blue-600">Frozen</p>
              <p className="text-sm font-semibold text-blue-900">
                {member.frozen_until || "Indefinitely"}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
