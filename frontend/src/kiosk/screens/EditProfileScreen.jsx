import { useEffect, useState } from "react";
import { ArrowLeft, Calendar, Save, User } from "lucide-react";
import toast from "react-hot-toast";
import KioskButton from "../components/KioskButton";
import KioskInput from "../components/KioskInput";
import { getSettings, updateProfile } from "../../api/kiosk";

export default function EditProfileScreen({ member, setMember, goTo, context }) {
  const [firstName, setFirstName] = useState(member?.first_name || "");
  const [lastName, setLastName] = useState(member?.last_name || "");
  const [phone, setPhone] = useState(member?.phone || "");
  const [email, setEmail] = useState(member?.email || "");
  const [dateOfBirth, setDateOfBirth] = useState(member?.date_of_birth || "");
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
        date_of_birth: dateOfBirth || null,
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
                <p className="mt-1 text-sm text-gray-500">Age: {age} years old</p>
              )}
            </div>

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
