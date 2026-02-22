import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, Calendar, CheckCircle, CreditCard, UserPlus, X } from "lucide-react";
import toast from "react-hot-toast";
import KioskButton from "../components/KioskButton";
import KioskInput from "../components/KioskInput";
import RFIDListener from "../components/RFIDListener";
import { checkCard, getPlans, getSettings, kioskSignup } from "../../api/kiosk";

export default function SignUpScreen({ setMember, goTo, goIdle }) {
  
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [isSenior, setIsSenior] = useState(false);
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [cardUid, setCardUid] = useState("");
  const [loading, setLoading] = useState(false);
  const [plans, setPlans] = useState([]);
  const [seniorAgeThreshold, setSeniorAgeThreshold] = useState(65);
  

  useEffect(() => {
    getSettings().then((settings) => {
      if (settings.senior_age_threshold) {
        setSeniorAgeThreshold(parseInt(settings.senior_age_threshold, 10));
      }
    }).catch(() => {});
    
    getPlans().then(setPlans).catch(() => {});
  }, []);

  // Calculate age from DOB
  function calculateAge(dob) {
    if (!dob) return null;
    const today = new Date();
    const birthDate = new Date(dob);
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  }

  const age = calculateAge(dateOfBirth);
  const qualifiesForSenior = age !== null && age >= seniorAgeThreshold;

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

  async function handleCreateAccount() {
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
        date_of_birth: dateOfBirth || null,
        is_senior: isSenior,
      });
      setMember(data);
      toast.success("Account created successfully!");
      // Go to plan selection
      goTo("payment", { fromSignup: true, pin });
    } catch (err) {
      toast.error(err.response?.data?.detail || "Sign up failed");
    } finally {
      setLoading(false);
    }
  }

  function handleSelectPlan(plan) {
    goTo("payment", { plan, pin });
  }

  function handleSkipPlan() {
    goTo("status", {
      statusType: "success",
      statusTitle: "Welcome!",
      statusMessage: "Your account has been created. You can purchase a plan anytime.",
    });
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
        <div className="w-full max-w-3xl">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-50">
              <UserPlus className="h-6 w-6 text-brand-600" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">Create Your Account</h2>
              <p className="text-sm text-gray-500">Join us to enjoy member benefits</p>
            </div>
          </div>

          <div className="space-y-3">
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

            <div className="grid grid-cols-2 gap-3">
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
            </div>

            <div className="grid grid-cols-3 gap-3">
              {/* Date of Birth - Optional */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Date of Birth (optional)
                </label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                  <input
                    type="date"
                    value={dateOfBirth}
                    onChange={(e) => {
                      setDateOfBirth(e.target.value);
                      const newAge = calculateAge(e.target.value);
                      if (newAge !== null && newAge >= seniorAgeThreshold) {
                        setIsSenior(true);
                      }
                    }}
                    className="w-full rounded-xl border border-gray-200 bg-white py-3 pl-10 pr-4 text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                  />
                </div>
                {age !== null && (
                  <p className="mt-1 text-xs text-gray-500">Age: {age}</p>
                )}
              </div>
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

            {/* Senior Citizen Checkbox - only show if DOB entered and qualifies */}
            {qualifiesForSenior && (
              <label className="flex items-center gap-3 rounded-xl bg-amber-50 p-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isSenior}
                  onChange={(e) => setIsSenior(e.target.checked)}
                  className="h-5 w-5 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                />
                <div>
                  <p className="font-medium text-amber-800">Senior Citizen Discount</p>
                  <p className="text-sm text-amber-600">You qualify ({seniorAgeThreshold}+ years)</p>
                </div>
              </label>
            )}



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
            icon={ArrowRight}
            loading={loading}
            onClick={handleCreateAccount}
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
