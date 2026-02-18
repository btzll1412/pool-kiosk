import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  CreditCard,
  DollarSign,
  Edit,
  History,
  Shield,
  Trash2,
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
  getMemberSavedCards,
} from "../../../api/members";
import Badge from "../../../shared/Badge";
import Button from "../../../shared/Button";
import Card, { CardHeader } from "../../../shared/Card";
import ConfirmDialog from "../../../shared/ConfirmDialog";
import Input from "../../../shared/Input";
import Modal from "../../../shared/Modal";
import PageHeader from "../../../shared/PageHeader";

export default function MemberDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [member, setMember] = useState(null);
  const [cards, setCards] = useState([]);
  const [savedCards, setSavedCards] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCredit, setShowCredit] = useState(false);
  const [showDeactivate, setShowDeactivate] = useState(false);
  const [creditAmount, setCreditAmount] = useState("");
  const [creditNotes, setCreditNotes] = useState("");
  const [creditLoading, setCreditLoading] = useState(false);

  const load = () => {
    setLoading(true);
    Promise.all([getMember(id), getMemberCards(id), getMemberHistory(id), getMemberSavedCards(id)])
      .then(([m, c, h, sc]) => {
        setMember(m);
        setCards(c);
        setHistory(h);
        setSavedCards(sc);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
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
    } catch {
      toast.error("Failed to deactivate member");
    }
  };

  const handleDeactivateCard = async (cardId) => {
    try {
      await deactivateCard(id, cardId);
      toast.success("Card deactivated");
      load();
    } catch {
      toast.error("Failed to deactivate card");
    }
  };

  const handleDeleteSavedCard = async (cardId) => {
    try {
      await deleteMemberSavedCard(id, cardId);
      toast.success("Saved card removed");
      load();
    } catch {
      toast.error("Failed to remove saved card");
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-brand-600" />
      </div>
    );
  }

  if (!member) return null;

  return (
    <div>
      <div className="mb-6">
        <button
          onClick={() => navigate("/admin/members")}
          className="mb-3 inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors"
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

      <div className="grid gap-6 lg:grid-cols-2 xl:grid-cols-4">
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
              <span className="text-lg font-bold text-gray-900">
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
            {member.notes && <InfoRow label="Notes">{member.notes}</InfoRow>}
          </dl>
        </Card>

        {/* RFID Cards */}
        <Card>
          <CardHeader title="RFID Cards" description={`${cards.length} card${cards.length !== 1 ? "s" : ""}`} />
          {cards.length === 0 ? (
            <p className="text-sm text-gray-400">No cards assigned</p>
          ) : (
            <div className="space-y-2">
              {cards.map((card) => (
                <div
                  key={card.id}
                  className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 px-4 py-3"
                >
                  <div className="flex items-center gap-3">
                    <CreditCard className="h-4 w-4 text-gray-400" />
                    <div>
                      <p className="text-sm font-mono font-medium text-gray-700">
                        {card.rfid_uid}
                      </p>
                      <p className="text-xs text-gray-400">
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
                        className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors"
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
            <p className="text-sm text-gray-400">No saved payment cards</p>
          ) : (
            <div className="space-y-2">
              {savedCards.map((sc) => (
                <div
                  key={sc.id}
                  className="rounded-lg border border-gray-100 bg-gray-50 px-4 py-3"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <CreditCard className="h-4 w-4 text-gray-400" />
                      <div>
                        <p className="text-sm font-medium text-gray-700">
                          {sc.friendly_name || `${sc.card_brand || "Card"} **** ${sc.card_last4}`}
                        </p>
                        <p className="text-xs text-gray-400">
                          {sc.card_brand} **** {sc.card_last4}
                          {sc.is_default && " · Default"}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => handleDeleteSavedCard(sc.id)}
                      className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors"
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

        {/* Activity History */}
        <Card>
          <CardHeader title="Activity Log" />
          {history.length === 0 ? (
            <p className="text-sm text-gray-400">No activity yet</p>
          ) : (
            <div className="space-y-3 max-h-80 overflow-y-auto scrollbar-thin">
              {history.slice(0, 20).map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-start gap-3 border-l-2 border-gray-200 pl-3"
                >
                  <div>
                    <p className="text-sm font-medium text-gray-700">
                      {entry.action_type.replace(".", " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                    </p>
                    {entry.note && (
                      <p className="text-xs text-gray-500">{entry.note}</p>
                    )}
                    <p className="text-xs text-gray-400">
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
    </div>
  );
}

function InfoRow({ label, children }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="text-sm text-gray-500">{label}</dt>
      <dd className="text-sm text-right">{children}</dd>
    </div>
  );
}
