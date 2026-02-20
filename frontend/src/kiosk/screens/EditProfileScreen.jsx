import { useState } from "react";
import { ArrowLeft, Save, User } from "lucide-react";
import toast from "react-hot-toast";
import KioskButton from "../components/KioskButton";
import KioskInput from "../components/KioskInput";
import { updateProfile } from "../../api/kiosk";

export default function EditProfileScreen({ member, setMember, goTo, context }) {
  const [firstName, setFirstName] = useState(member?.first_name || "");
  const [lastName, setLastName] = useState(member?.last_name || "");
  const [phone, setPhone] = useState(member?.phone || "");
  const [email, setEmail] = useState(member?.email || "");
  const [loading, setLoading] = useState(false);

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
