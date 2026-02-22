import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import toast from "react-hot-toast";
import { createMember, getMember, updateMember } from "../../../api/members";
import Button from "../../../shared/Button";
import Card from "../../../shared/Card";
import Input from "../../../shared/Input";
import PageHeader from "../../../shared/PageHeader";
import { SkeletonLine } from "../../../shared/Skeleton";

export default function MemberForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = !!id;

  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    phone: "",
    email: "",
    pin: "",
    notes: "",
    date_of_birth: "",
    is_senior: false,
  });
  const [seniorAgeThreshold, setSeniorAgeThreshold] = useState(65);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(isEdit);

  useEffect(() => {
    // Fetch senior age threshold setting
    fetch("/api/settings/senior_age_threshold")
      .then(r => r.json())
      .then(data => {
        if (data.value) setSeniorAgeThreshold(parseInt(data.value, 10));
      })
      .catch(() => {});
    
    if (isEdit) {
      getMember(id)
        .then((m) =>
          setForm({
            first_name: m.first_name,
            last_name: m.last_name,
            phone: m.phone || "",
            email: m.email || "",
            pin: "",
            notes: m.notes || "",
            date_of_birth: m.date_of_birth || "",
            is_senior: m.is_senior || false,
          })
        )
        .catch((err) => toast.error(err.response?.data?.detail || "Failed to load member"))
        .finally(() => setFetching(false));
    }
  }, [id, isEdit]);

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

  const age = calculateAge(form.date_of_birth);
  const qualifiesForSenior = age !== null && age >= seniorAgeThreshold;

  const handleChange = (field) => (e) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const payload = { ...form };
      if (!payload.phone) payload.phone = null;
      if (!payload.email) payload.email = null;
      if (!payload.pin) delete payload.pin;
      if (!payload.notes) payload.notes = null;
      if (!payload.date_of_birth) payload.date_of_birth = null;

      if (isEdit) {
        delete payload.pin;
        await updateMember(id, payload);
        toast.success("Member updated");
        navigate(`/admin/members/${id}`);
      } else {
        const member = await createMember(payload);
        toast.success("Member created");
        navigate(`/admin/members/${member.id}`);
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to save member");
    } finally {
      setLoading(false);
    }
  };

  if (fetching) {
    return (
      <div className="mx-auto max-w-2xl">
        <SkeletonLine width="w-20" height="h-4" className="mb-4" />
        <Card>
          <div className="space-y-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i}>
                <SkeletonLine width="w-24" height="h-3" className="mb-2" />
                <SkeletonLine width="w-full" height="h-10" />
              </div>
            ))}
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <button
        onClick={() => navigate(-1)}
        className="mb-3 inline-flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back
      </button>

      <PageHeader title={isEdit ? "Edit Member" : "New Member"} />

      <Card>
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid gap-5 sm:grid-cols-2">
            <Input
              label="First Name"
              value={form.first_name}
              onChange={handleChange("first_name")}
              required
              placeholder="John"
            />
            <Input
              label="Last Name"
              value={form.last_name}
              onChange={handleChange("last_name")}
              required
              placeholder="Smith"
            />
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <Input
              label="Phone"
              type="tel"
              value={form.phone}
              onChange={handleChange("phone")}
              placeholder="(555) 123-4567"
            />
            <Input
              label="Email"
              type="email"
              value={form.email}
              onChange={handleChange("email")}
              placeholder="john@example.com"
            />
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Date of Birth
              </label>
              <input
                type="date"
                value={form.date_of_birth}
                onChange={(e) => {
                  const newDob = e.target.value;
                  setForm(f => {
                    const newAge = calculateAge(newDob);
                    return {
                      ...f,
                      date_of_birth: newDob,
                      is_senior: newAge !== null && newAge >= seniorAgeThreshold ? true : f.is_senior
                    };
                  });
                }}
                className="block w-full rounded-lg border-0 px-3.5 py-2.5 text-sm text-gray-900 dark:text-gray-100 shadow-sm ring-1 ring-inset ring-gray-300 dark:ring-gray-600 focus:ring-2 focus:ring-inset focus:ring-brand-600 dark:bg-gray-800"
              />
              {age !== null && (
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Age: {age} years old</p>
              )}
            </div>
            {qualifiesForSenior && (
              <div className="flex items-center">
                <label className="flex items-center gap-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 p-4 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.is_senior}
                    onChange={(e) => setForm(f => ({ ...f, is_senior: e.target.checked }))}
                    className="h-5 w-5 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                  />
                  <div>
                    <p className="font-medium text-amber-800 dark:text-amber-200">Senior Citizen</p>
                    <p className="text-sm text-amber-600 dark:text-amber-400">
                      Qualifies for senior pricing
                    </p>
                  </div>
                </label>
              </div>
            )}
          </div>

          {!isEdit && (
            <Input
              label="PIN"
              type="password"
              maxLength={6}
              value={form.pin}
              onChange={handleChange("pin")}
              placeholder="4-6 digit PIN"
              helpText="Required for kiosk purchases and account management"
            />
          )}

          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Notes
            </label>
            <textarea
              value={form.notes}
              onChange={handleChange("notes")}
              rows={3}
              placeholder="Admin notes about this member..."
              className="block w-full rounded-lg border-0 px-3.5 py-2.5 text-sm text-gray-900 dark:text-gray-100 shadow-sm ring-1 ring-inset ring-gray-300 dark:ring-gray-600 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-brand-600 dark:bg-gray-800"
            />
          </div>

          <div className="flex justify-end gap-3 border-t border-gray-100 dark:border-gray-700 pt-5">
            <Button variant="secondary" type="button" onClick={() => navigate(-1)}>
              Cancel
            </Button>
            <Button type="submit" loading={loading}>
              {isEdit ? "Save Changes" : "Create Member"}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
