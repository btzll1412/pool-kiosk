import { useEffect, useState } from "react";
import { DollarSign, Edit, Plus, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import { createPlan, deactivatePlan, getPlans, updatePlan } from "../../../api/plans";
import Badge from "../../../shared/Badge";
import Button from "../../../shared/Button";
import Card from "../../../shared/Card";
import ConfirmDialog from "../../../shared/ConfirmDialog";
import EmptyState from "../../../shared/EmptyState";
import PageHeader from "../../../shared/PageHeader";

export default function PlansList() {
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const load = () => {
    setLoading(true);
    getPlans()
      .then(setPlans)
      .catch((err) => toast.error(err.response?.data?.detail || "Failed to load plans"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const handleDeactivate = async () => {
    try {
      await deactivatePlan(deleteTarget.id);
      toast.success("Plan deactivated");
      setDeleteTarget(null);
      load();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to deactivate plan");
    }
  };

  const typeLabel = {
    single: "Single Swim",
    swim_pass: "Swim Pass",
    monthly: "Monthly",
  };

  const typeColor = {
    single: "blue",
    swim_pass: "purple",
    monthly: "green",
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-brand-600" />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Plans"
        description="Manage pricing and membership plans"
        actions={
          <Button
            icon={Plus}
            onClick={() => {
              setEditing(null);
              setShowForm(true);
            }}
          >
            Add Plan
          </Button>
        }
      />

      {plans.length === 0 ? (
        <EmptyState
          title="No plans yet"
          description="Create your first plan to get started"
          actionLabel="Add Plan"
          onAction={() => setShowForm(true)}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {plans.map((plan) => (
            <Card key={plan.id} className={!plan.is_active ? "opacity-60" : ""}>
              <div className="flex items-start justify-between mb-3">
                <Badge color={typeColor[plan.plan_type]}>
                  {typeLabel[plan.plan_type]}
                </Badge>
                <div className="flex gap-1">
                  <button
                    onClick={() => {
                      setEditing(plan);
                      setShowForm(true);
                    }}
                    className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
                  >
                    <Edit className="h-4 w-4" />
                  </button>
                  {plan.is_active && (
                    <button
                      onClick={() => setDeleteTarget(plan)}
                      className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>

              <h3 className="text-lg font-semibold text-gray-900">
                {plan.name}
              </h3>

              <div className="mt-2 flex items-baseline gap-1">
                <span className="text-3xl font-bold tracking-tight text-gray-900">
                  ${Number(plan.price).toFixed(2)}
                </span>
                {plan.plan_type === "monthly" && (
                  <span className="text-sm text-gray-500">
                    / {plan.duration_days} days
                  </span>
                )}
              </div>

              <div className="mt-3 text-sm text-gray-500">
                {plan.plan_type === "swim_pass" &&
                  `${plan.swim_count} swim${plan.swim_count !== 1 ? "s" : ""} included`}
                {plan.plan_type === "monthly" &&
                  `Valid for ${plan.duration_days} days`}
                {plan.plan_type === "single" && "One-time swim"}
              </div>

              {!plan.is_active && (
                <Badge color="red" className="mt-3">
                  Inactive
                </Badge>
              )}
            </Card>
          ))}
        </div>
      )}

      {showForm && (
        <PlanForm
          plan={editing}
          onClose={() => setShowForm(false)}
          onSaved={() => {
            setShowForm(false);
            load();
          }}
        />
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDeactivate}
        title="Deactivate Plan"
        message={`Are you sure you want to deactivate "${deleteTarget?.name}"? It will no longer appear on the kiosk.`}
        confirmLabel="Deactivate"
      />
    </div>
  );
}

function PlanForm({ plan, onClose, onSaved }) {
  const [form, setForm] = useState({
    name: plan?.name || "",
    plan_type: plan?.plan_type || "single",
    price: plan?.price || "",
    swim_count: plan?.swim_count || "",
    duration_days: plan?.duration_days || "",
    display_order: plan?.display_order ?? 0,
  });
  const [loading, setLoading] = useState(false);

  const handleChange = (field) => (e) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const payload = {
        name: form.name,
        plan_type: form.plan_type,
        price: parseFloat(form.price),
        swim_count: form.plan_type === "swim_pass" ? parseInt(form.swim_count) : null,
        duration_days: form.plan_type === "monthly" ? parseInt(form.duration_days) : null,
        display_order: parseInt(form.display_order) || 0,
      };

      if (plan) {
        await updatePlan(plan.id, payload);
        toast.success("Plan updated");
      } else {
        await createPlan(payload);
        toast.success("Plan created");
      }
      onSaved();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to save plan");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg rounded-xl bg-white shadow-2xl ring-1 ring-gray-900/5">
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">
            {plan ? "Edit Plan" : "New Plan"}
          </h2>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              Plan Name
            </label>
            <input
              value={form.name}
              onChange={handleChange("name")}
              required
              placeholder='e.g. "Single Swim", "10-Swim Pack"'
              className="block w-full rounded-lg border-0 px-3.5 py-2.5 text-sm shadow-sm ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-brand-600"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">
                Type
              </label>
              <select
                value={form.plan_type}
                onChange={handleChange("plan_type")}
                className="block w-full rounded-lg border-0 px-3.5 py-2.5 text-sm shadow-sm ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-brand-600"
              >
                <option value="single">Single Swim</option>
                <option value="swim_pass">Swim Pass</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">
                Price ($)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.price}
                onChange={handleChange("price")}
                required
                className="block w-full rounded-lg border-0 px-3.5 py-2.5 text-sm shadow-sm ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-brand-600"
              />
            </div>
          </div>

          {form.plan_type === "swim_pass" && (
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">
                Number of Swims
              </label>
              <input
                type="number"
                min="1"
                value={form.swim_count}
                onChange={handleChange("swim_count")}
                required
                className="block w-full rounded-lg border-0 px-3.5 py-2.5 text-sm shadow-sm ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-brand-600"
              />
            </div>
          )}

          {form.plan_type === "monthly" && (
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">
                Duration (days)
              </label>
              <input
                type="number"
                min="1"
                value={form.duration_days}
                onChange={handleChange("duration_days")}
                required
                className="block w-full rounded-lg border-0 px-3.5 py-2.5 text-sm shadow-sm ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-brand-600"
              />
            </div>
          )}

          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              Display Order
            </label>
            <input
              type="number"
              min="0"
              value={form.display_order}
              onChange={handleChange("display_order")}
              className="block w-full rounded-lg border-0 px-3.5 py-2.5 text-sm shadow-sm ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-brand-600"
            />
            <p className="mt-1 text-xs text-gray-500">
              Lower numbers appear first on the kiosk
            </p>
          </div>

          <div className="flex justify-end gap-3 border-t border-gray-100 pt-4">
            <Button variant="secondary" type="button" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={loading}>
              {plan ? "Save Changes" : "Create Plan"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
