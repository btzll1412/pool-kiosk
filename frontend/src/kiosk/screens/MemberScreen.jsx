import { useState } from "react";
import { ArrowLeft, LogIn, Settings, ShoppingBag, Snowflake } from "lucide-react";
import toast from "react-hot-toast";
import MemberCard from "../components/MemberCard";
import KioskButton from "../components/KioskButton";
import { checkin } from "../../api/kiosk";

export default function MemberScreen({ member, goTo, goIdle }) {
  const [loading, setLoading] = useState(false);

  if (!member) {
    goIdle();
    return null;
  }

  const hasActivePlan = !!member.active_membership;
  const isFrozen = member.is_frozen;

  async function handleCheckin() {
    setLoading(true);
    try {
      const result = await checkin(member.member_id, 0);
      goTo("checkin", { checkinResult: result });
    } catch (err) {
      toast.error(err.response?.data?.detail || "Check-in failed");
    } finally {
      setLoading(false);
    }
  }

  function handlePurchase() {
    if (member.has_pin) {
      goTo("pin", { afterPin: "payment" });
    } else {
      goTo("payment");
    }
  }

  function handleManage() {
    goTo("pin", { afterPin: "manage" });
  }

  function handleUnfreeze() {
    goTo("pin", { afterPin: "unfreeze" });
  }

  return (
    <div className="flex h-full flex-col bg-gray-50">
      <div className="flex items-center justify-between border-b border-gray-100 bg-white px-6 py-4">
        <button
          type="button"
          onClick={goIdle}
          className="flex items-center gap-2 rounded-xl px-4 py-2 text-gray-500 transition-all hover:bg-gray-100 active:bg-gray-200"
        >
          <ArrowLeft className="h-5 w-5" />
          <span className="font-medium">Back</span>
        </button>
        <h1 className="text-lg font-bold text-gray-900">Member</h1>
        <div className="w-24" />
      </div>

      <div className="flex flex-1 flex-col items-center justify-center px-6 py-8">
        <div className="w-full max-w-lg">
          <MemberCard member={member} />

          <div className="mt-8 space-y-4">
            {isFrozen ? (
              <>
                <div className="rounded-2xl bg-blue-50 p-6 text-center">
                  <Snowflake className="mx-auto h-10 w-10 text-blue-500" />
                  <p className="mt-3 text-lg font-semibold text-blue-900">
                    Your membership is frozen
                  </p>
                  <p className="mt-1 text-sm text-blue-600">
                    {member.frozen_until
                      ? `Frozen until ${member.frozen_until}`
                      : "Frozen until further notice"}
                  </p>
                </div>
                <KioskButton
                  variant="primary"
                  size="xl"
                  icon={Snowflake}
                  onClick={handleUnfreeze}
                  className="w-full"
                >
                  Unfreeze Membership
                </KioskButton>
              </>
            ) : hasActivePlan ? (
              <KioskButton
                variant="success"
                size="xl"
                icon={LogIn}
                onClick={handleCheckin}
                loading={loading}
                className="w-full"
              >
                Tap to Check In
              </KioskButton>
            ) : (
              <div className="rounded-2xl bg-amber-50 p-6 text-center">
                <ShoppingBag className="mx-auto h-10 w-10 text-amber-500" />
                <p className="mt-3 text-lg font-semibold text-amber-900">
                  No active plan
                </p>
                <p className="mt-1 text-sm text-amber-600">
                  Purchase a plan to check in
                </p>
              </div>
            )}

            <div className="flex gap-3">
              <KioskButton
                variant="secondary"
                size="lg"
                icon={ShoppingBag}
                onClick={handlePurchase}
                className="flex-1"
              >
                {hasActivePlan ? "Top Up" : "Buy Plan"}
              </KioskButton>
              {member.has_pin && (
                <KioskButton
                  variant="secondary"
                  size="lg"
                  icon={Settings}
                  onClick={handleManage}
                  className="flex-1"
                >
                  Manage Account
                </KioskButton>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
