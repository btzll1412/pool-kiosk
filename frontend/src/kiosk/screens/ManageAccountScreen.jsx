import { ArrowLeft, CreditCard, ShoppingBag, User, Waves } from "lucide-react";
import MemberCard from "../components/MemberCard";
import KioskButton from "../components/KioskButton";

export default function ManageAccountScreen({ member, goTo, context }) {
  if (!member) return null;

  const membership = member.active_membership;

  return (
    <div className="flex h-full flex-col bg-gray-50">
      <div className="flex items-center justify-between border-b border-gray-100 bg-white px-6 py-4">
        <button
          type="button"
          onClick={() => goTo("member")}
          className="flex items-center gap-2 rounded-xl px-4 py-2 text-gray-500 transition-all hover:bg-gray-100 active:bg-gray-200"
        >
          <ArrowLeft className="h-5 w-5" />
          <span className="font-medium">Back</span>
        </button>
        <h1 className="text-lg font-bold text-gray-900">Manage My Account</h1>
        <div className="w-24" />
      </div>

      <div className="flex flex-1 flex-col items-center overflow-y-auto px-6 py-8">
        <div className="w-full max-w-lg">
          <MemberCard member={member} />

          <div className="mt-8 space-y-3">
            {membership && (
              <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-100">
                <div className="flex items-center gap-3">
                  <Waves className="h-5 w-5 text-brand-600" />
                  <h3 className="font-semibold text-gray-900">Membership Status</h3>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-gray-500">Plan</p>
                    <p className="font-medium text-gray-900">{membership.plan_name}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Type</p>
                    <p className="font-medium text-gray-900 capitalize">{membership.plan_type?.replace("_", " ")}</p>
                  </div>
                  {membership.valid_until && (
                    <div>
                      <p className="text-gray-500">Valid Until</p>
                      <p className="font-medium text-gray-900">{membership.valid_until}</p>
                    </div>
                  )}
                  {membership.swims_remaining != null && (
                    <div>
                      <p className="text-gray-500">Swims Left</p>
                      <p className="font-medium text-gray-900">{membership.swims_remaining}</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            <KioskButton
              variant="secondary"
              size="lg"
              icon={User}
              onClick={() => goTo("editProfile", { pin: context.pin })}
              className="w-full"
            >
              Edit Profile
            </KioskButton>

            <KioskButton
              variant="secondary"
              size="lg"
              icon={CreditCard}
              onClick={() => goTo("savedCards", { pin: context.pin })}
              className="w-full"
            >
              Manage Saved Cards
            </KioskButton>

            <KioskButton
              variant="secondary"
              size="lg"
              icon={ShoppingBag}
              onClick={() => goTo("payment", { pin: context.pin })}
              className="w-full"
            >
              Purchase Plan
            </KioskButton>
          </div>
        </div>
      </div>
    </div>
  );
}
