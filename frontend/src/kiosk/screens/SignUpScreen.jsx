import { useState } from "react";
import { ArrowLeft, CheckCircle, CreditCard, UserPlus, X } from "lucide-react";
import toast from "react-hot-toast";
import KioskButton from "../components/KioskButton";
import KioskInput from "../components/KioskInput";
import RFIDListener from "../components/RFIDListener";
import { checkCard, kioskSignup } from "../../api/kiosk";

export default function SignUpScreen({ setMember, goTo, goIdle }) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [cardUid, setCardUid] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleCardScan(uid) {
    try {
      const result = await checkCard(uid);
      if (result.available) {
        setCardUid(uid);
        toast.success("Card scanned and available!");
      } else {
        toast.error(result.message);
      }
    } catch (err) {
      toast.error("Failed to check card");
    }
  }

  function clearCard() {
    setCardUid("");
  }

  async function handleSubmit() {
    if (!firstName.trim() || !lastName.trim()) {
      toast.error("Please enter your full name");
      return;
    }
    if (!phone.trim()) {
      toast.error("Please enter your phone number");
      return;
    }
    if (pin.length !== 4 || !/^\d{4}$/.test(pin)) {
      toast.error("PIN must be 4 digits");
      return;
    }
    if (pin !== confirmPin) {
      toast.error("PINs do not match");
      return;
    }

    setLoading(true);
    try {
      const data = await kioskSignup({
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        phone: phone.trim(),
        email: email.trim() || null,
        pin,
        rfid_uid: cardUid || null,
      });
      setMember(data);
      goTo("status", {
        statusType: "success",
        statusTitle: "Welcome!",
        statusMessage: cardUid
          ? "Your account has been created and your card is linked. You can now purchase a plan."
          : "Your account has been created. You can now purchase a plan.",
      });
    } catch (err) {
      toast.error(err.response?.data?.detail || "Sign up failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex h-full flex-col bg-gray-50">
      {/* RFID Listener - disabled once a card is scanned */}
      <RFIDListener onScan={handleCardScan} disabled={!!cardUid} />

      <div className="flex items-center justify-between border-b border-gray-100 bg-white px-6 py-4">
        <button
          type="button"
          onClick={goIdle}
          className="flex items-center gap-2 rounded-xl px-4 py-2 text-gray-500 transition-all hover:bg-gray-100 active:bg-gray-200"
        >
          <ArrowLeft className="h-5 w-5" />
          <span className="font-medium">Back</span>
        </button>
        <h1 className="text-lg font-bold text-gray-900">New Member</h1>
        <div className="w-24" />
      </div>

      <div className="flex flex-1 flex-col items-center overflow-y-auto px-6 py-6">
        <div className="w-full max-w-md">
          <div className="mb-6 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-50">
              <UserPlus className="h-8 w-8 text-brand-600" />
            </div>
            <h2 className="mt-4 text-2xl font-bold text-gray-900">
              Create Your Account
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              Join us to enjoy member benefits
            </p>
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <KioskInput
                label="First Name *"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="Tap to enter"
              />
              <KioskInput
                label="Last Name *"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Doe"
              />
            </div>

            <KioskInput
              label="Phone *"
              type="tel"
              numeric
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="5551234567"
            />

            <KioskInput
              label="Email (optional)"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="john@example.com"
            />

            <div className="grid grid-cols-2 gap-3">
              <KioskInput
                label="4-Digit PIN *"
                numeric
                maxLength={4}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                placeholder="****"
                className="text-center tracking-widest"
              />
              <KioskInput
                label="Confirm PIN *"
                numeric
                maxLength={4}
                value={confirmPin}
                onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ""))}
                placeholder="****"
                className="text-center tracking-widest"
              />
            </div>

            {/* Card Assignment Section */}
            <div className="rounded-2xl border-2 border-dashed border-gray-200 bg-white p-4">
              <div className="flex items-center gap-3 mb-2">
                <CreditCard className="h-5 w-5 text-gray-400" />
                <span className="font-medium text-gray-700">Membership Card (Optional)</span>
              </div>

              {cardUid ? (
                <div className="flex items-center justify-between rounded-xl bg-green-50 px-4 py-3">
                  <div className="flex items-center gap-3">
                    <CheckCircle className="h-5 w-5 text-green-600" />
                    <div>
                      <p className="font-medium text-green-800">Card Linked</p>
                      <p className="text-sm font-mono text-green-600">{cardUid}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={clearCard}
                    className="rounded-lg p-2 text-green-600 hover:bg-green-100 transition-colors"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              ) : (
                <div className="text-center py-4">
                  <p className="text-sm text-gray-500 mb-2">
                    Take a card from the pile and scan it now
                  </p>
                  <div className="inline-flex items-center gap-2 rounded-full bg-brand-50 px-4 py-2">
                    <div className="h-2 w-2 rounded-full bg-brand-500 animate-pulse" />
                    <span className="text-sm font-medium text-brand-700">Waiting for card scan...</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          <KioskButton
            variant="primary"
            size="xl"
            icon={UserPlus}
            loading={loading}
            onClick={handleSubmit}
            className="mt-6 w-full"
          >
            Create Account
          </KioskButton>

          <p className="mt-4 text-center text-sm text-gray-500">
            Already have an account?{" "}
            <button
              type="button"
              onClick={() => goTo("search")}
              className="font-medium text-brand-600 hover:text-brand-700"
            >
              Search for it
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
