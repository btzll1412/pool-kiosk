import { useEffect, useState } from "react";
import { ArrowLeft, Save, User } from "lucide-react";
import toast from "react-hot-toast";
import KioskButton from "../components/KioskButton";
import KioskInput from "../components/KioskInput";
import { getSettings, updateProfile } from "../../api/kiosk";

export default function EditProfileScreen({ member, setMember, goTo, context }) {
  const [firstName, setFirstName] = useState(member?.first_name || "");
  const [lastName, setLastName] = useState(member?.last_name || "");
  const [phone, setPhone] = useState(member?.phone || "");
  const [email, setEmail] = useState(member?.email || "");
  const [dateOfBirth, setDateOfBirth] = useState(() => {
    const dob = member?.date_of_birth || "";
    if (dob && dob.includes("-")) {
      const [y, m, d] = dob.split("-");
      return `${m}/${d}/${y}`;
    }
    return dob;
  });
  const [isSenior, setIsSenior] = useState(member?.is_senior || false);
  const [seniorAgeThreshold, setSeniorAgeThreshold] = useState(65);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    getSettings().then((settings) => {
      if (settings.senior_age_threshold) {
        setSeniorAgeThreshold(parseInt(settings.senior_age_threshold, 10));
      }
    }).catch(() => {});
  }, []);

  function dobToIso(dob) {
    if (!dob) return null;
    const digits = dob.replace(/\D/g, "");
    if (digits.length !== 8) return null;
    return `${digits.slice(4, 8)}-${digits.slice(0, 2)}-${digits.slice(2, 4)}`;
  }

  function calculateAge(iso) {
    if (!iso) return null;
    const today = new Date();
    const birthDate = new Date(iso);
    if (isNaN(birthDate)) return null;
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age >= 0 ? age : null;
  }

  const age = calculateAge(dobToIso(dateOfBirth));
  const qualifiesForSenior = age !== null && age >= seniorAgeThreshold;

  if (!member) return null;

  async function handleSave() {
    if (!firstName.trim() || !lastName.trim()) {
      toast.error("Please enter your full name");
      return;
    }
    if (!phone.trim()) {
      toast.error("Please enter your phone number");
      return;
    }

    setLoading(true);
    try {
      const updated = await updateProfile({
        member_id: member.member_id,
        pin: context.pin,
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        phone: phone.trim(),
        email: email.trim() || null,
        date_of_birth: dobToIso(dateOfBirth) || null,
        is_senior: isSenior,
      });
      setMember(updated);
      toast.success("Profile updated successfully");
      goTo("manage", { pin: context.pin });
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to update profile");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex h-full flex-col bg-gray-50">
      <div className="flex items-center justify-between border-b border-gray-100 bg-white px-6 py-4">
        <button
          type="button"
          onClick={() => goTo("manage", { pin: context.pin })}
          className="flex items-center gap-2 rounded-xl px-4 py-2 text-gray-500 transition-all hover:bg-gray-100 active:bg-gray-200"
        >
          <ArrowLeft className="h-5 w-5" />
          <span className="font-medium">Back</span>
        </button>
        <h1 className="text-lg font-bold text-gray-900">Edit Profile</h1>
        <div className="w-24" />
      </div>

      <div className="flex flex-1 flex-col items-center overflow-y-auto px-6 py-6">
        <div className="w-full max-w-md">
          <div className="mb-6 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-50">
              <User className="h-8 w-8 text-brand-600" />
            </div>
            <h2 className="mt-4 text-2xl font-bold text-gray-900">
              Update Your Info
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              Make changes to your account details
            </p>
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <KioskInput
                label="First Name *"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="John"
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

            {/* Date of Birth */}
            <KioskInput
              label={`Date of Birth (optional)${age !== null ? ` — Age: ${age}` : ""}`}
              numeric
              value={dateOfBirth}
              onChange={(e) => {
                const raw = e.target.value.replace(/\D/g, "");
                let formatted = raw;
                if (raw.length > 2) formatted = raw.slice(0, 2) + "/" + raw.slice(2);
                if (raw.length > 4) formatted = raw.slice(0, 2) + "/" + raw.slice(2, 4) + "/" + raw.slice(4, 8);
                setDateOfBirth(formatted);
                if (raw.length === 8) {
                  const iso = `${raw.slice(4, 8)}-${raw.slice(0, 2)}-${raw.slice(2, 4)}`;
                  const newAge = calculateAge(iso);
                  if (newAge !== null && newAge >= seniorAgeThreshold) {
                    setIsSenior(true);
                  }
                }
              }}
              placeholder="MM/DD/YYYY"
              maxLength={10}
              inputId="dob"
            />

            {/* Senior Citizen Checkbox */}
            {qualifiesForSenior && (
              <label className="flex items-center gap-3 rounded-xl bg-amber-50 p-4 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isSenior}
                  onChange={(e) => setIsSenior(e.target.checked)}
                  className="h-5 w-5 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                />
                <div>
                  <p className="font-medium text-amber-800">Senior Citizen Discount</p>
                  <p className="text-sm text-amber-600">
                    You qualify for senior pricing ({seniorAgeThreshold}+ years)
                  </p>
                </div>
              </label>
            )}
          </div>

          <KioskButton
            variant="primary"
            size="xl"
            icon={Save}
            loading={loading}
            onClick={handleSave}
            className="mt-6 w-full"
          >
            Save Changes
          </KioskButton>
        </div>
      </div>
    </div>
  );
}
