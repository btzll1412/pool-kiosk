import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import toast from "react-hot-toast";
import { createMember, getMember, updateMember } from "../../../api/members";
import Button from "../../../shared/Button";
import Card from "../../../shared/Card";
import Input from "../../../shared/Input";
import PageHeader from "../../../shared/PageHeader";

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
  });
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(isEdit);

  useEffect(() => {
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
          })
        )
        .finally(() => setFetching(false));
    }
  }, [id, isEdit]);

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
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-brand-600" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <button
        onClick={() => navigate(-1)}
        className="mb-3 inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors"
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
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              Notes
            </label>
            <textarea
              value={form.notes}
              onChange={handleChange("notes")}
              rows={3}
              placeholder="Admin notes about this member..."
              className="block w-full rounded-lg border-0 px-3.5 py-2.5 text-sm text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-brand-600"
            />
          </div>

          <div className="flex justify-end gap-3 border-t border-gray-100 pt-5">
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
