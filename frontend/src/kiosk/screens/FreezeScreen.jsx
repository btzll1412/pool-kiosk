import { useState } from "react";
import { ArrowLeft, Snowflake } from "lucide-react";
import toast from "react-hot-toast";
import NumPad from "../components/NumPad";
import KioskButton from "../components/KioskButton";
import { freezeMembership } from "../../api/kiosk";

export default function FreezeScreen({ member, goTo, context, settings }) {
  const pin = context.pin;
  const [days, setDays] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleFreeze() {
    const numDays = parseInt(days, 10);
    if (!numDays || numDays < 1) {
      toast.error("Enter number of days (at least 1)");
      return;
    }
    if (numDays > 365) {
      toast.error("Maximum 365 days");
      return;
    }

    setLoading(true);
    try {
      const data = await freezeMembership(member.member_id, pin, numDays);
      goTo("status", {
        statusType: "info",
        statusTitle: "Membership Frozen",
        statusMessage: data.message || `Your membership has been frozen for ${numDays} days.`,
      });
    } catch (err) {
      toast.error(err.response?.data?.detail || "Freeze failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex h-full flex-col bg-gray-50">
      <div className="flex items-center justify-between border-b border-gray-100 bg-white px-6 py-4">
        <button
          type="button"
          onClick={() => goTo("manage")}
          className="flex items-center gap-2 rounded-xl px-4 py-2 text-gray-500 transition-all hover:bg-gray-100 active:bg-gray-200"
        >
          <ArrowLeft className="h-5 w-5" />
          <span className="font-medium">Back</span>
        </button>
        <h1 className="text-lg font-bold text-gray-900">Freeze Membership</h1>
        <div className="w-24" />
      </div>

      <div className="flex flex-1 flex-col items-center justify-center px-6">
        <div className="w-full max-w-xs text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-50">
            <Snowflake className="h-8 w-8 text-blue-600" />
          </div>
          <h2 className="mt-4 text-2xl font-bold text-gray-900">
            Freeze for how long?
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            Enter the number of days to freeze your membership
          </p>

          <div className="mt-6 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-100">
            <p className="text-sm text-gray-500">Days to Freeze</p>
            <p className="mt-1 text-4xl font-extrabold text-gray-900">
              {days || "0"}
            </p>
          </div>

          <div className="mt-4">
            <NumPad value={days} onChange={setDays} maxLength={3} />
          </div>

          <KioskButton
            variant="primary"
            size="xl"
            icon={Snowflake}
            loading={loading}
            disabled={!days || parseInt(days, 10) < 1}
            onClick={handleFreeze}
            className="mt-4 w-full"
          >
            Freeze Membership
          </KioskButton>
        </div>
      </div>
    </div>
  );
}
