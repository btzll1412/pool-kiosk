import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Calendar,
  CreditCard,
  DollarSign,
  Edit,
  History,
  Lock,
  Minus,
  Plus,
  Shield,
  Ticket,
  Trash2,
  Unlock,
  UserX,
  Zap,
} from "lucide-react";
import toast from "react-hot-toast";
import {
  adjustCredit,
  deactivateCard,
  deactivateMember,
  deleteMemberSavedCard,
  getMember,
  getMemberCards,
  getMemberHistory,
  getMemberMemberships,
  getMemberPinStatus,
  getMemberSavedCards,
  unlockMemberPin,
} from "../../../api/members";
import {
  adjustMembershipSwims,
  createMembership,
  updateMembership,
} from "../../../api/memberships";
import { getPlans } from "../../../api/plans";
import Badge from "../../../shared/Badge";
import Button from "../../../shared/Button";
import Card, { CardHeader } from "../../../shared/Card";
import ConfirmDialog from "../../../shared/ConfirmDialog";
import Input from "../../../shared/Input";
import Modal from "../../../shared/Modal";
import PageHeader from "../../../shared/PageHeader";
import { SkeletonLine, SkeletonCard } from "../../../shared/Skeleton";

export default function MemberDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [member, setMember] = useState(null);
  const [cards, setCards] = useState([]);
  const [savedCards, setSavedCards] = useState([]);
  const [memberships, setMemberships] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCredit, setShowCredit] = useState(false);
  const [showDeactivate, setShowDeactivate] = useState(false);
  const [creditAmount, setCreditAmount] = useState("");
  const [creditNotes, setCreditNotes] = useState("");
  const [creditLoading, setCreditLoading] = useState(false);

  // Membership management
  const [plans, setPlans] = useState([]);
  const [showAddMembership, setShowAddMembership] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState("");
  const [addMembershipLoading, setAddMembershipLoading] = useState(false);
  const [showAdjustSwims, setShowAdjustSwims] = useState(false);
  const [adjustingMembership, setAdjustingMembership] = useState(null);
  const [swimAdjustment, setSwimAdjustment] = useState("");
  const [swimNotes, setSwimNotes] = useState("");
  const [swimAdjustLoading, setSwimAdjustLoading] = useState(false);
  const [deactivateMembershipTarget, setDeactivateMembershipTarget] = useState(null);

  // PIN lockout
  const [pinStatus, setPinStatus] = useState(null);

  const load = () => {
    setLoading(true);
    Promise.all([
      getMember(id),
      getMemberCards(id),
      getMemberHistory(id),
      getMemberSavedCards(id),
      getMemberMemberships(id),
      getMemberPinStatus(id),
    ])
      .then(([m, c, h, sc, ms, ps]) => {
        setMember(m);
        setCards(c);
        setHistory(h);
        setSavedCards(sc);
        setMemberships(ms);
        setPinStatus(ps);
      })
      .catch((err) => toast.error(err.response?.data?.detail || "Failed to load member details"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    getPlans().then(setPlans).catch(() => {});
  }, [id]);

  const handleCreditAdjust = async () => {
    setCreditLoading(true);
    try {
      const updated = await adjustCredit(id, {
        amount: parseFloat(creditAmount),
        notes: creditNotes || null,
      });
      setMember(updated);
      setShowCredit(false);
      setCreditAmount("");
      setCreditNotes("");
      toast.success("Credit adjusted successfully");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to adjust credit");
    } finally {
      setCreditLoading(false);
    }
  };

  const handleDeactivate = async () => {
    try {
      await deactivateMember(id);
      toast.success("Member deactivated");
      navigate("/admin/members");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to deactivate member");
    }
  };

  const handleDeactivateCard = async (cardId) => {
    try {
      await deactivateCard(id, cardId);
      toast.success("Card deactivated");
      load();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to deactivate card");
    }
  };

  const handleDeleteSavedCard = async (cardId) => {
    try {
      await deleteMemberSavedCard(id, cardId);
      toast.success("Saved card removed");
      load();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to remove saved card");
    }
  };

  const handleAddMembership = async () => {
    if (!selectedPlanId) return;
    setAddMembershipLoading(true);
    try {
      await createMembership({ member_id: id, plan_id: selectedPlanId });
      toast.success("Membership added");
      setShowAddMembership(false);
      setSelectedPlanId("");
      load();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to add membership");
    } finally {
      setAddMembershipLoading(false);
    }
  };

  const handleAdjustSwims = async () => {
    if (!adjustingMembership || !swimAdjustment) return;
    setSwimAdjustLoading(true);
    try {
      await adjustMembershipSwims(
        adjustingMembership.id,
        parseInt(swimAdjustment),
        swimNotes || null
      );
      toast.success("Swims adjusted");
      setShowAdjustSwims(false);
      setAdjustingMembership(null);
      setSwimAdjustment("");
      setSwimNotes("");
      load();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to adjust swims");
    } finally {
      setSwimAdjustLoading(false);
    }
  };

  const handleDeactivateMembership = async () => {
    if (!deactivateMembershipTarget) return;
    try {
      await updateMembership(deactivateMembershipTarget.id, { is_active: false });
      toast.success("Membership deactivated");
      setDeactivateMembershipTarget(null);
      load();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to deactivate membership");
    }
  };

  const handleUnlockPin = async () => {
    try {
      await unlockMemberPin(id);
      toast.success("PIN unlocked successfully");
      load();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to unlock PIN");
    }
  };

  if (loading) {
    return (
      <div>
        <SkeletonLine width="w-20" height="h-4" className="mb-4" />
        <div className="space-y-6">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      </div>
    );
  }

  if (!member) return null;

  return (
    <div>
      <div className="mb-6">
        <button
          onClick={() => navigate("/admin/members")}
          className="mb-3 inline-flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to members
        </button>
        <PageHeader
          title={`${member.first_name} ${member.last_name}`}
          description={member.email || member.phone || "No contact info"}
          actions={
            <div className="flex gap-2">
              <Button
                variant="secondary"
                icon={Edit}
                onClick={() => navigate(`/admin/members/${id}/edit`)}
              >
                Edit
              </Button>
              <Button
                variant="secondary"
                icon={DollarSign}
                onClick={() => setShowCredit(true)}
              >
                Adjust Credit
              </Button>
              {member.is_active && (
                <Button
                  variant="danger"
                  icon={UserX}
                  onClick={() => setShowDeactivate(true)}
                >
                  Deactivate
                </Button>
              )}
            </div>
          }
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2 xl:grid-cols-3">
        {/* Member Info */}
        <Card>
          <CardHeader title="Member Info" />
          <dl className="space-y-3">
            <InfoRow label="Status">
              {member.is_active ? (
                <Badge color="green">Active</Badge>
              ) : (
                <Badge color="red">Inactive</Badge>
              )}
            </InfoRow>
            <InfoRow label="Phone">{member.phone || "—"}</InfoRow>
            <InfoRow label="Email">{member.email || "—"}</InfoRow>
            <InfoRow label="Credit Balance">
              <span className="text-lg font-bold text-gray-900 dark:text-gray-100">
                ${Number(member.credit_balance).toFixed(2)}
              </span>
            </InfoRow>
            <InfoRow label="Joined">
              {new Date(member.created_at).toLocaleDateString("en-US", {
                month: "long",
                day: "numeric",
                year: "numeric",
              })}
            </InfoRow>
            {pinStatus?.is_locked && (
              <InfoRow label="PIN Status">
                <div className="flex items-center gap-2">
                  <Badge color="red">
                    <Lock className="h-3 w-3 mr-1" />
                    Locked
                  </Badge>
                  <button
                    onClick={handleUnlockPin}
                    className="flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700"
                  >
                    <Unlock className="h-3 w-3" />
                    Unlock
                  </button>
                </div>
              </InfoRow>
            )}
            {member.notes && <InfoRow label="Notes">{member.notes}</InfoRow>}
          </dl>
        </Card>

        {/* RFID Cards */}
        <Card>
          <CardHeader title="RFID Cards" description={`${cards.length} card${cards.length !== 1 ? "s" : ""}`} />
          {cards.length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-gray-500">No cards assigned</p>
          ) : (
            <div className="space-y-2">
              {cards.map((card) => (
                <div
                  key={card.id}
                  className="flex items-center justify-between rounded-lg border border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 px-4 py-3"
                >
                  <div className="flex items-center gap-3">
                    <CreditCard className="h-4 w-4 text-gray-400 dark:text-gray-500" />
                    <div>
                      <p className="text-sm font-mono font-medium text-gray-700 dark:text-gray-300">
                        {card.rfid_uid}
                      </p>
                      <p className="text-xs text-gray-400 dark:text-gray-500">
                        {new Date(card.assigned_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {card.is_active ? (
                      <Badge color="green">Active</Badge>
                    ) : (
                      <Badge color="red">Inactive</Badge>
                    )}
                    {card.is_active && (
                      <button
                        onClick={() => handleDeactivateCard(card.id)}
                        className="rounded p-1 text-gray-400 dark:text-gray-500 hover:bg-red-50 hover:text-red-500 transition-colors"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Saved Payment Cards */}
        <Card>
          <CardHeader title="Saved Cards" description={`${savedCards.length} card${savedCards.length !== 1 ? "s" : ""}`} />
          {savedCards.length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-gray-500">No saved payment cards</p>
          ) : (
            <div className="space-y-2">
              {savedCards.map((sc) => (
                <div
                  key={sc.id}
                  className="rounded-lg border border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 px-4 py-3"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <CreditCard className="h-4 w-4 text-gray-400 dark:text-gray-500" />
                      <div>
                        <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                          {sc.friendly_name || `${sc.card_brand || "Card"} **** ${sc.card_last4}`}
                        </p>
                        <p className="text-xs text-gray-400 dark:text-gray-500">
                          {sc.card_brand} **** {sc.card_last4}
                          {sc.is_default && " · Default"}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => handleDeleteSavedCard(sc.id)}
                      className="rounded p-1 text-gray-400 dark:text-gray-500 hover:bg-red-50 hover:text-red-500 transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  {sc.auto_charge_enabled && (
                    <div className="mt-2 flex items-center gap-1.5 text-xs text-emerald-600">
                      <Zap className="h-3 w-3" />
                      Auto-charge: {sc.auto_charge_plan_name}
                      {sc.next_charge_date && ` · Next: ${sc.next_charge_date}`}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Memberships / Plans */}
        <Card>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                Memberships
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {memberships.filter((m) => m.is_active).length} active
              </p>
            </div>
            <button
              onClick={() => setShowAddMembership(true)}
              className="flex items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-700"
            >
              <Plus className="h-4 w-4" />
              Add
            </button>
          </div>
          {memberships.length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-gray-500">No memberships</p>
          ) : (
            <div className="space-y-3 max-h-80 overflow-y-auto scrollbar-thin">
              {memberships.map((ms) => (
                <div
                  key={ms.id}
                  className={`rounded-lg border px-4 py-3 ${
                    ms.is_active
                      ? "border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900"
                      : "border-gray-100 dark:border-gray-800 bg-gray-100 dark:bg-gray-900 opacity-60"
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      <Ticket className="h-4 w-4 text-gray-400 dark:text-gray-500 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                          {ms.plan_name || "Manual Plan"}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 capitalize">
                          {ms.plan_type.replace("_", " ")}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      {ms.is_active ? (
                        <Badge color="green">Active</Badge>
                      ) : (
                        <Badge color="gray">Expired</Badge>
                      )}
                      {ms.is_active && (
                        <div className="flex items-center gap-0.5 ml-1">
                          {ms.plan_type === "swim_pass" && (
                            <button
                              onClick={() => {
                                setAdjustingMembership(ms);
                                setShowAdjustSwims(true);
                              }}
                              className="rounded p-1 text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                              title="Adjust swims"
                            >
                              <Edit className="h-3.5 w-3.5" />
                            </button>
                          )}
                          <button
                            onClick={() => setDeactivateMembershipTarget(ms)}
                            className="rounded p-1 text-gray-400 dark:text-gray-500 hover:bg-red-50 hover:text-red-500 transition-colors"
                            title="Deactivate"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Swim pass details */}
                  {ms.plan_type === "swim_pass" && ms.swims_total !== null && (
                    <div className="mt-2 flex items-center gap-2">
                      <div className="flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-brand-500 rounded-full"
                          style={{
                            width: `${Math.max(0, ((ms.swims_remaining || 0) / ms.swims_total) * 100)}%`,
                          }}
                        />
                      </div>
                      <span className="text-xs font-medium text-gray-600 dark:text-gray-400">
                        {ms.swims_remaining}/{ms.swims_total} swims
                      </span>
                    </div>
                  )}

                  {/* Monthly membership dates */}
                  {ms.plan_type === "monthly" && (
                    <div className="mt-2 flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                      <Calendar className="h-3 w-3" />
                      {ms.valid_from && ms.valid_until ? (
                        <span>
                          {ms.valid_from} — {ms.valid_until}
                        </span>
                      ) : ms.valid_until ? (
                        <span>Expires: {ms.valid_until}</span>
                      ) : (
                        <span>No expiration</span>
                      )}
                    </div>
                  )}

                  <p className="mt-1.5 text-xs text-gray-400 dark:text-gray-500">
                    Created: {new Date(ms.created_at).toLocaleDateString()}
                  </p>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Activity History */}
        <Card>
          <CardHeader title="Activity Log" />
          {history.length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-gray-500">No activity yet</p>
          ) : (
            <div className="space-y-3 max-h-80 overflow-y-auto scrollbar-thin">
              {history.slice(0, 20).map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-start gap-3 border-l-2 border-gray-200 dark:border-gray-700 pl-3"
                >
                  <div>
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      {entry.action_type.replace(".", " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                    </p>
                    {entry.note && (
                      <p className="text-xs text-gray-500 dark:text-gray-400">{entry.note}</p>
                    )}
                    <p className="text-xs text-gray-400 dark:text-gray-500">
                      {new Date(entry.created_at).toLocaleString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Credit Adjustment Modal */}
      <Modal
        open={showCredit}
        onClose={() => setShowCredit(false)}
        title="Adjust Credit Balance"
        size="sm"
      >
        <div className="space-y-4">
          <Input
            label="Amount"
            type="number"
            step="0.01"
            value={creditAmount}
            onChange={(e) => setCreditAmount(e.target.value)}
            placeholder="Enter amount (negative to deduct)"
            helpText="Use negative value to deduct credit"
          />
          <Input
            label="Notes (optional)"
            value={creditNotes}
            onChange={(e) => setCreditNotes(e.target.value)}
            placeholder="Reason for adjustment"
          />
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={() => setShowCredit(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreditAdjust}
              loading={creditLoading}
              disabled={!creditAmount}
            >
              Apply
            </Button>
          </div>
        </div>
      </Modal>

      {/* Deactivate Confirmation */}
      <ConfirmDialog
        open={showDeactivate}
        onClose={() => setShowDeactivate(false)}
        onConfirm={handleDeactivate}
        title="Deactivate Member"
        message={`Are you sure you want to deactivate ${member.first_name} ${member.last_name}? They will no longer be able to check in.`}
        confirmLabel="Deactivate"
      />

      {/* Add Membership Modal */}
      <Modal
        open={showAddMembership}
        onClose={() => {
          setShowAddMembership(false);
          setSelectedPlanId("");
        }}
        title="Add Membership"
        size="sm"
      >
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Select Plan
            </label>
            <select
              value={selectedPlanId}
              onChange={(e) => setSelectedPlanId(e.target.value)}
              className="block w-full rounded-lg border-0 px-3.5 py-2.5 text-sm shadow-sm ring-1 ring-inset ring-gray-300 dark:ring-gray-600 focus:ring-2 focus:ring-brand-600 dark:bg-gray-800 dark:text-gray-100"
            >
              <option value="">Choose a plan...</option>
              {plans
                .filter((p) => p.is_active)
                .map((plan) => (
                  <option key={plan.id} value={plan.id}>
                    {plan.name} - ${Number(plan.price).toFixed(2)}
                    {plan.plan_type === "swim_pass" && ` (${plan.swim_count} swims)`}
                    {plan.plan_type === "monthly" && ` (${plan.duration_days} days)`}
                  </option>
                ))}
            </select>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button
              variant="secondary"
              onClick={() => {
                setShowAddMembership(false);
                setSelectedPlanId("");
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleAddMembership}
              loading={addMembershipLoading}
              disabled={!selectedPlanId}
            >
              Add Membership
            </Button>
          </div>
        </div>
      </Modal>

      {/* Adjust Swims Modal */}
      <Modal
        open={showAdjustSwims}
        onClose={() => {
          setShowAdjustSwims(false);
          setAdjustingMembership(null);
          setSwimAdjustment("");
          setSwimNotes("");
        }}
        title="Adjust Swims"
        size="sm"
      >
        <div className="space-y-4">
          {adjustingMembership && (
            <div className="rounded-lg bg-gray-50 dark:bg-gray-900 p-3">
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {adjustingMembership.plan_name}
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Current: {adjustingMembership.swims_remaining}/{adjustingMembership.swims_total} swims remaining
              </p>
            </div>
          )}
          <Input
            label="Adjustment"
            type="number"
            value={swimAdjustment}
            onChange={(e) => setSwimAdjustment(e.target.value)}
            placeholder="Enter amount (negative to deduct)"
            helpText="Use positive to add swims, negative to deduct"
          />
          <Input
            label="Notes (optional)"
            value={swimNotes}
            onChange={(e) => setSwimNotes(e.target.value)}
            placeholder="Reason for adjustment"
          />
          <div className="flex justify-end gap-3 pt-2">
            <Button
              variant="secondary"
              onClick={() => {
                setShowAdjustSwims(false);
                setAdjustingMembership(null);
                setSwimAdjustment("");
                setSwimNotes("");
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleAdjustSwims}
              loading={swimAdjustLoading}
              disabled={!swimAdjustment}
            >
              Apply
            </Button>
          </div>
        </div>
      </Modal>

      {/* Deactivate Membership Confirmation */}
      <ConfirmDialog
        open={!!deactivateMembershipTarget}
        onClose={() => setDeactivateMembershipTarget(null)}
        onConfirm={handleDeactivateMembership}
        title="Deactivate Membership"
        message={`Are you sure you want to deactivate this ${deactivateMembershipTarget?.plan_name || "membership"}? The member will no longer be able to use it.`}
        confirmLabel="Deactivate"
      />
    </div>
  );
}

function InfoRow({ label, children }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="text-sm text-gray-500 dark:text-gray-400">{label}</dt>
      <dd className="text-sm text-right">{children}</dd>
    </div>
  );
}
