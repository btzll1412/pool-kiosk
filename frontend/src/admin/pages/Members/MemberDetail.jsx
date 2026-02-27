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
  Power,
  PowerOff,
  Shield,
  Ticket,
  Trash2,
  Unlock,
  UserX,
  Wifi,
  WifiOff,
  Zap,
} from "lucide-react";
import toast from "react-hot-toast";
import { useTimezone, formatDate, formatDateTime } from "../../../context/TimezoneContext";
import {
  addMemberSavedCard,
  adjustCredit,
  assignCard,
  chargeCard,
  deactivateCard,
  reactivateCard,
  deleteCard,
  deactivateMember,
  reactivateMember,
  permanentlyDeleteMember,
  deleteMemberSavedCard,
  getMember,
  getMemberCards,
  getMemberHistory,
  getMemberMemberships,
  getMemberPinStatus,
  getMemberSavedCards,
  resetMemberPin,
  tokenizeCardFromSwipe,
  tokenizeCardFromFull,
  unlockMemberPin,
} from "../../../api/members";
import {
  adjustMembershipSwims,
  createMembership,
  updateMembership,
} from "../../../api/memberships";
import { getPlans } from "../../../api/plans";
import { getTransactions } from "../../../api/payments";
import Badge from "../../../shared/Badge";
import Button from "../../../shared/Button";
import Card, { CardHeader } from "../../../shared/Card";
import ConfirmDialog from "../../../shared/ConfirmDialog";
import Input from "../../../shared/Input";
import Modal from "../../../shared/Modal";
import useNFCReader from "../../../hooks/useNFCReader";
import useCardReader from "../../../hooks/useCardReader";
import PageHeader from "../../../shared/PageHeader";
import { SkeletonLine, SkeletonCard } from "../../../shared/Skeleton";

export default function MemberDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const timezone = useTimezone();
  const [member, setMember] = useState(null);
  const [cards, setCards] = useState([]);
  const [savedCards, setSavedCards] = useState([]);
  const [memberships, setMemberships] = useState([]);
  const [history, setHistory] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCredit, setShowCredit] = useState(false);
  const [showDeactivate, setShowDeactivate] = useState(false);
  const [showPermanentDelete, setShowPermanentDelete] = useState(false);
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

  // Payment options for Add Membership
  const [chargeNow, setChargeNow] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [cashAmount, setCashAmount] = useState("");
  const [useExistingCard, setUseExistingCard] = useState(true);
  const [selectedSavedCardId, setSelectedSavedCardId] = useState("");
  const [newCardLast4, setNewCardLast4] = useState("");
  const [newCardBrand, setNewCardBrand] = useState("Visa");
  const [saveNewCard, setSaveNewCard] = useState(false);
  const [enableAutopay, setEnableAutopay] = useState(false);
  // Full card entry for real charging
  const [newCardNumber, setNewCardNumber] = useState("");
  const [newCardExpMonth, setNewCardExpMonth] = useState("");
  const [newCardExpYear, setNewCardExpYear] = useState("");
  const [newCardCvv, setNewCardCvv] = useState("");
  const [cardEntryMode, setCardEntryMode] = useState("record"); // "record" or "charge"

  // Add Card on File
  const [showAddCard, setShowAddCard] = useState(false);
  const [addCardMethod, setAddCardMethod] = useState("swipe"); // "swipe", "manual", "hosted"
  const [addCardLast4, setAddCardLast4] = useState("");
  const [addCardBrand, setAddCardBrand] = useState("Visa");
  const [addCardName, setAddCardName] = useState("");
  const [addCardLoading, setAddCardLoading] = useState(false);
  const [swipeData, setSwipeData] = useState("");
  const [fullCardNumber, setFullCardNumber] = useState("");
  const [fullCardExp, setFullCardExp] = useState("");

  // PIN lockout and reset
  const [pinStatus, setPinStatus] = useState(null);
  const [showResetPin, setShowResetPin] = useState(false);
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [resetPinLoading, setResetPinLoading] = useState(false);

  // Card management
  const [deactivateCardTarget, setDeactivateCardTarget] = useState(null);
  const [deleteCardTarget, setDeleteCardTarget] = useState(null);
  const [showAssignCard, setShowAssignCard] = useState(false);
  const [newCardUid, setNewCardUid] = useState("");
  const [assignCardLoading, setAssignCardLoading] = useState(false);

  // Listen for NFC scans when modal is open
  const { connected: nfcConnected } = useNFCReader({
    onScan: (uid) => {
      if (showAssignCard) {
        setNewCardUid(uid);
      }
    },
    enabled: showAssignCard,
  });

  // Listen for card swipes when add card modal is open in swipe mode
  useCardReader({
    onSwipe: (trackData) => {
      if (showAddCard && addCardMethod === "swipe") {
        setSwipeData(trackData);
        toast.success("Card swiped! Click Save to tokenize.");
      }
    },
    enabled: showAddCard && addCardMethod === "swipe",
  });

  const load = () => {
    setLoading(true);
    Promise.all([
      getMember(id),
      getMemberCards(id),
      getMemberHistory(id),
      getMemberSavedCards(id),
      getMemberMemberships(id),
      getMemberPinStatus(id),
      getTransactions({ member_id: id, per_page: 50 }),
    ])
      .then(([m, c, h, sc, ms, ps, tx]) => {
        setMember(m);
        setCards(c);
        setHistory(h);
        setSavedCards(sc);
        setMemberships(ms);
        setPinStatus(ps);
        setTransactions(tx.items || []);
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

  const handleReactivate = async () => {
    try {
      await reactivateMember(id);
      toast.success("Member reactivated");
      load();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to reactivate member");
    }
  };

  const handlePermanentDelete = async () => {
    try {
      await permanentlyDeleteMember(id);
      toast.success("Member permanently deleted");
      navigate("/admin/members");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to delete member");
    }
  };

  const handleDeactivateCard = async () => {
    if (!deactivateCardTarget) return;
    try {
      await deactivateCard(id, deactivateCardTarget.id);
      toast.success("Card deactivated");
      setDeactivateCardTarget(null);
      load();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to deactivate card");
    }
  };

  const handleReactivateCard = async (cardId) => {
    try {
      await reactivateCard(id, cardId);
      toast.success("Card reactivated");
      load();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to reactivate card");
    }
  };

  const handleDeleteCard = async () => {
    if (!deleteCardTarget) return;
    try {
      await deleteCard(id, deleteCardTarget.id);
      toast.success("Card deleted");
      setDeleteCardTarget(null);
      load();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to delete card");
    }
  };

  const handleAssignCard = async () => {
    if (!newCardUid.trim()) return;
    setAssignCardLoading(true);
    try {
      await assignCard(id, { rfid_uid: newCardUid.trim() });
      toast.success("Card assigned successfully");
      setShowAssignCard(false);
      setNewCardUid("");
      load();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to assign card");
    } finally {
      setAssignCardLoading(false);
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
      const selectedPlan = plans.find(p => p.id === selectedPlanId);

      // If charging with full card details, process real charge first
      if (chargeNow && paymentMethod === "card" && !useExistingCard && cardEntryMode === "charge") {
        // Validate card details
        const cleanCardNumber = newCardNumber.replace(/\s/g, "");
        if (cleanCardNumber.length < 13 || cleanCardNumber.length > 19) {
          toast.error("Please enter a valid card number");
          setAddMembershipLoading(false);
          return;
        }
        if (!newCardExpMonth || !newCardExpYear) {
          toast.error("Please enter the card expiration date");
          setAddMembershipLoading(false);
          return;
        }
        if (newCardCvv.length < 3 || newCardCvv.length > 4) {
          toast.error("Please enter a valid CVV (3-4 digits)");
          setAddMembershipLoading(false);
          return;
        }

        const expDate = `${newCardExpMonth.padStart(2, "0")}${newCardExpYear.slice(-2)}`;
        const amount = selectedPlan ? selectedPlan.price : "0";

        // Charge the card via admin API
        try {
          await chargeCard(
            id,
            cleanCardNumber,
            expDate,
            newCardCvv,
            amount,
            `Membership: ${selectedPlan?.name || "Plan"}`,
            saveNewCard
          );
          toast.success("Card charged successfully");
        } catch (err) {
          toast.error(err.response?.data?.detail || "Card charge failed");
          setAddMembershipLoading(false);
          return;
        }
      }

      const payload = { member_id: id, plan_id: selectedPlanId };

      // Build payment info if charging now (for record-keeping)
      if (chargeNow) {
        if (paymentMethod === "cash") {
          payload.payment = {
            payment_method: "cash",
            amount_tendered: cashAmount ? parseFloat(cashAmount) : null,
          };
        } else if (paymentMethod === "card") {
          if (useExistingCard && selectedSavedCardId) {
            payload.payment = {
              payment_method: "card",
              saved_card_id: selectedSavedCardId,
            };
          } else if (!useExistingCard && cardEntryMode === "record" && newCardLast4) {
            // Record-only mode
            payload.payment = {
              payment_method: "card",
              card_last4: newCardLast4,
              card_brand: newCardBrand,
              save_card: saveNewCard,
              enable_autopay: enableAutopay,
            };
          } else if (!useExistingCard && cardEntryMode === "charge") {
            // Already charged above, just record last4
            const cleanCardNumber = newCardNumber.replace(/\s/g, "");
            payload.payment = {
              payment_method: "card",
              card_last4: cleanCardNumber.slice(-4),
              card_brand: detectCardBrand(cleanCardNumber),
              save_card: false, // Already saved during charge if requested
              enable_autopay: enableAutopay,
            };
          }
        }
      }

      const result = await createMembership(payload);
      toast.success(result.message || "Membership added");
      setShowAddMembership(false);
      resetMembershipForm();
      load();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to add membership");
    } finally {
      setAddMembershipLoading(false);
    }
  };

  function detectCardBrand(cardNumber) {
    if (cardNumber.startsWith("4")) return "Visa";
    if (cardNumber.startsWith("5") || (cardNumber.length >= 4 && parseInt(cardNumber.slice(0, 4)) >= 2221 && parseInt(cardNumber.slice(0, 4)) <= 2720)) return "Mastercard";
    if (cardNumber.startsWith("34") || cardNumber.startsWith("37")) return "Amex";
    if (cardNumber.startsWith("6011") || cardNumber.startsWith("65")) return "Discover";
    return "Card";
  }

  function formatCardNumber(value) {
    const digits = value.replace(/\D/g, "");
    const formatted = digits.replace(/(\d{4})(?=\d)/g, "$1 ");
    return formatted.slice(0, 23);
  }

  const resetMembershipForm = () => {
    setSelectedPlanId("");
    setChargeNow(false);
    setPaymentMethod("cash");
    setCashAmount("");
    setUseExistingCard(true);
    setSelectedSavedCardId("");
    setNewCardLast4("");
    setNewCardBrand("Visa");
    setSaveNewCard(false);
    setEnableAutopay(false);
    setNewCardNumber("");
    setNewCardExpMonth("");
    setNewCardExpYear("");
    setNewCardCvv("");
    setCardEntryMode("record");
  };

  const handleAddCard = async () => {
    setAddCardLoading(true);
    try {
      if (addCardMethod === "swipe") {
        // Tokenize from card swipe data
        if (!swipeData) {
          toast.error("Please swipe a card first");
          setAddCardLoading(false);
          return;
        }
        await tokenizeCardFromSwipe(id, swipeData, addCardName || null);
        toast.success("Card tokenized and saved successfully");
      } else if (addCardMethod === "hosted") {
        // Tokenize from full card details (hosted form entry)
        if (!fullCardNumber || fullCardNumber.length < 13) {
          toast.error("Please enter a valid card number");
          setAddCardLoading(false);
          return;
        }
        if (!fullCardExp || fullCardExp.length !== 4) {
          toast.error("Please enter expiry as MMYY (e.g., 1225)");
          setAddCardLoading(false);
          return;
        }
        await tokenizeCardFromFull(id, fullCardNumber, fullCardExp, addCardName || null);
        toast.success("Card tokenized and saved successfully");
      } else {
        // Manual entry - just record last 4 (no real tokenization)
        if (!addCardLast4 || addCardLast4.length !== 4) {
          toast.error("Please enter exactly 4 digits");
          setAddCardLoading(false);
          return;
        }
        await addMemberSavedCard(id, {
          card_last4: addCardLast4,
          card_brand: addCardBrand,
          friendly_name: addCardName || null,
        });
        toast.success("Card recorded successfully");
      }
      resetAddCardForm();
      load();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to add card");
    } finally {
      setAddCardLoading(false);
    }
  };

  const resetAddCardForm = () => {
    setShowAddCard(false);
    setAddCardMethod("swipe");
    setAddCardLast4("");
    setAddCardBrand("Visa");
    setAddCardName("");
    setSwipeData("");
    setFullCardNumber("");
    setFullCardExp("");
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

  const handleResetPin = async () => {
    if (newPin !== confirmPin) {
      toast.error("PINs do not match");
      return;
    }
    if (newPin.length < 4 || newPin.length > 6 || !/^\d+$/.test(newPin)) {
      toast.error("PIN must be 4-6 digits");
      return;
    }
    setResetPinLoading(true);
    try {
      await resetMemberPin(id, newPin);
      toast.success("PIN reset successfully");
      setShowResetPin(false);
      setNewPin("");
      setConfirmPin("");
      load();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to reset PIN");
    } finally {
      setResetPinLoading(false);
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
              <Button
                variant="secondary"
                icon={Lock}
                onClick={() => setShowResetPin(true)}
              >
                Reset PIN
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
              {!member.is_active && (
                <>
                  <Button
                    variant="primary"
                    icon={Power}
                    onClick={handleReactivate}
                  >
                    Reactivate
                  </Button>
                  <Button
                    variant="danger"
                    icon={Trash2}
                    onClick={() => setShowPermanentDelete(true)}
                  >
                    Delete Permanently
                  </Button>
                </>
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
              {formatDate(member.created_at, timezone, {
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
          <div className="flex items-center justify-between mb-4">
            <CardHeader title="RFID Cards" description={`${cards.length} card${cards.length !== 1 ? "s" : ""}`} />
            <Button
              variant="secondary"
              size="sm"
              icon={Plus}
              onClick={() => setShowAssignCard(true)}
            >
              Assign Card
            </Button>
          </div>
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
                        {formatDate(card.assigned_at, timezone)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {card.is_active ? (
                      <Badge color="green">Active</Badge>
                    ) : (
                      <Badge color="red">Inactive</Badge>
                    )}
                    {card.is_active ? (
                      <button
                        onClick={() => setDeactivateCardTarget(card)}
                        className="rounded p-1 text-gray-400 dark:text-gray-500 hover:bg-amber-50 hover:text-amber-500 transition-colors"
                        title="Deactivate card"
                      >
                        <PowerOff className="h-3.5 w-3.5" />
                      </button>
                    ) : (
                      <button
                        onClick={() => handleReactivateCard(card.id)}
                        className="rounded p-1 text-gray-400 dark:text-gray-500 hover:bg-green-50 hover:text-green-500 transition-colors"
                        title="Reactivate card"
                      >
                        <Power className="h-3.5 w-3.5" />
                      </button>
                    )}
                    <button
                      onClick={() => setDeleteCardTarget(card)}
                      className="rounded p-1 text-gray-400 dark:text-gray-500 hover:bg-red-50 hover:text-red-500 transition-colors"
                      title="Delete card"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Saved Payment Cards */}
        <Card>
          <div className="flex items-center justify-between mb-4">
            <CardHeader title="Saved Cards" description={`${savedCards.length} card${savedCards.length !== 1 ? "s" : ""}`} />
            <Button
              variant="secondary"
              size="sm"
              icon={Plus}
              onClick={() => setShowAddCard(true)}
            >
              Add Card
            </Button>
          </div>
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
                    Created: {formatDate(ms.created_at, timezone)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Transactions */}
        <Card>
          <CardHeader title="Transactions" />
          {transactions.length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-gray-500">No transactions yet</p>
          ) : (
            <div className="space-y-2 max-h-80 overflow-y-auto scrollbar-thin">
              {transactions.map((tx) => (
                <div
                  key={tx.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50"
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full ${
                      tx.transaction_type === "payment" ? "bg-green-500" :
                      tx.transaction_type === "refund" ? "bg-red-500" :
                      tx.transaction_type === "credit_add" ? "bg-blue-500" :
                      tx.transaction_type === "credit_use" ? "bg-purple-500" : "bg-gray-500"
                    }`} />
                    <div>
                      <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        {tx.transaction_type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                        {tx.plan_name && <span className="text-gray-500"> - {tx.plan_name}</span>}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {formatDateTime(tx.created_at, timezone)} · {tx.payment_method}
                      </p>
                    </div>
                  </div>
                  <p className={`text-sm font-semibold ${
                    tx.transaction_type === "refund" || tx.transaction_type === "credit_use"
                      ? "text-red-600"
                      : "text-green-600"
                  }`}>
                    {tx.transaction_type === "refund" || tx.transaction_type === "credit_use" ? "-" : "+"}
                    ${Number(tx.amount).toFixed(2)}
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
                      {formatDateTime(entry.created_at, timezone)}
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

      {/* Reset PIN Modal */}
      <Modal
        open={showResetPin}
        onClose={() => {
          setShowResetPin(false);
          setNewPin("");
          setConfirmPin("");
        }}
        title="Reset Member PIN"
        size="sm"
      >
        <div className="space-y-4">
          <Input
            label="New PIN"
            type="password"
            maxLength={6}
            value={newPin}
            onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ""))}
            placeholder="Enter 4-6 digit PIN"
            helpText="PIN must be 4-6 digits"
          />
          <Input
            label="Confirm PIN"
            type="password"
            maxLength={6}
            value={confirmPin}
            onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ""))}
            placeholder="Confirm PIN"
          />
          <div className="flex justify-end gap-3 pt-2">
            <Button
              variant="secondary"
              onClick={() => {
                setShowResetPin(false);
                setNewPin("");
                setConfirmPin("");
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleResetPin}
              loading={resetPinLoading}
              disabled={!newPin || !confirmPin || newPin.length < 4}
            >
              Reset PIN
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

      {/* Permanent Delete Confirmation */}
      <ConfirmDialog
        open={showPermanentDelete}
        onClose={() => setShowPermanentDelete(false)}
        onConfirm={handlePermanentDelete}
        title="Permanently Delete Member"
        message={`Are you sure you want to PERMANENTLY delete ${member.first_name} ${member.last_name}? This will remove all their data including check-in history, memberships, and saved cards. This action cannot be undone.`}
        confirmLabel="Delete Forever"
      />

      {/* Add Membership Modal */}
      <Modal
        open={showAddMembership}
        onClose={() => {
          setShowAddMembership(false);
          resetMembershipForm();
        }}
        title="Add Membership"
        size="md"
      >
        <div className="space-y-4">
          {/* Plan Selection */}
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

          {/* Charge Now Checkbox */}
          {selectedPlanId && (
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="chargeNow"
                checked={chargeNow}
                onChange={(e) => setChargeNow(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-600"
              />
              <label htmlFor="chargeNow" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Collect payment now
              </label>
            </div>
          )}

          {/* Payment Options */}
          {chargeNow && selectedPlanId && (
            <div className="space-y-4 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
              {/* Payment Method Selection */}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Payment Method
                </label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="paymentMethod"
                      value="cash"
                      checked={paymentMethod === "cash"}
                      onChange={(e) => setPaymentMethod(e.target.value)}
                      className="h-4 w-4 border-gray-300 text-brand-600 focus:ring-brand-600"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300">Cash</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="paymentMethod"
                      value="card"
                      checked={paymentMethod === "card"}
                      onChange={(e) => setPaymentMethod(e.target.value)}
                      className="h-4 w-4 border-gray-300 text-brand-600 focus:ring-brand-600"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300">Card</span>
                  </label>
                </div>
              </div>

              {/* Cash Payment Options */}
              {paymentMethod === "cash" && (
                <Input
                  label="Amount Received"
                  type="number"
                  step="0.01"
                  value={cashAmount}
                  onChange={(e) => setCashAmount(e.target.value)}
                  placeholder={`Plan price: $${Number(plans.find(p => p.id === selectedPlanId)?.price || 0).toFixed(2)}`}
                  helpText="Leave blank to use plan price"
                />
              )}

              {/* Card Payment Options */}
              {paymentMethod === "card" && (
                <div className="space-y-3">
                  {/* Use Existing or New Card */}
                  {savedCards.length > 0 && (
                    <div className="flex gap-4">
                      <label className="flex items-center gap-2">
                        <input
                          type="radio"
                          name="cardSource"
                          checked={useExistingCard}
                          onChange={() => setUseExistingCard(true)}
                          className="h-4 w-4 border-gray-300 text-brand-600 focus:ring-brand-600"
                        />
                        <span className="text-sm text-gray-700 dark:text-gray-300">Use saved card</span>
                      </label>
                      <label className="flex items-center gap-2">
                        <input
                          type="radio"
                          name="cardSource"
                          checked={!useExistingCard}
                          onChange={() => setUseExistingCard(false)}
                          className="h-4 w-4 border-gray-300 text-brand-600 focus:ring-brand-600"
                        />
                        <span className="text-sm text-gray-700 dark:text-gray-300">Enter new card</span>
                      </label>
                    </div>
                  )}

                  {/* Saved Card Selection */}
                  {useExistingCard && savedCards.length > 0 && (
                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                        Select Saved Card
                      </label>
                      <select
                        value={selectedSavedCardId}
                        onChange={(e) => setSelectedSavedCardId(e.target.value)}
                        className="block w-full rounded-lg border-0 px-3.5 py-2.5 text-sm shadow-sm ring-1 ring-inset ring-gray-300 dark:ring-gray-600 focus:ring-2 focus:ring-brand-600 dark:bg-gray-800 dark:text-gray-100"
                      >
                        <option value="">Choose a card...</option>
                        {savedCards.map((card) => (
                          <option key={card.id} value={card.id}>
                            {card.friendly_name || `${card.card_brand} **** ${card.card_last4}`}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* New Card Entry */}
                  {(!useExistingCard || savedCards.length === 0) && (
                    <>
                      {/* Card Entry Mode Selection */}
                      <div className="flex gap-4 mb-3">
                        <label className="flex items-center gap-2">
                          <input
                            type="radio"
                            name="cardEntryMode"
                            checked={cardEntryMode === "charge"}
                            onChange={() => setCardEntryMode("charge")}
                            className="h-4 w-4 border-gray-300 text-brand-600 focus:ring-brand-600"
                          />
                          <span className="text-sm text-gray-700 dark:text-gray-300">Enter full card (charge now)</span>
                        </label>
                        <label className="flex items-center gap-2">
                          <input
                            type="radio"
                            name="cardEntryMode"
                            checked={cardEntryMode === "record"}
                            onChange={() => setCardEntryMode("record")}
                            className="h-4 w-4 border-gray-300 text-brand-600 focus:ring-brand-600"
                          />
                          <span className="text-sm text-gray-700 dark:text-gray-300">Record only (no charge)</span>
                        </label>
                      </div>

                      {/* Full Card Entry Mode */}
                      {cardEntryMode === "charge" && (
                        <div className="space-y-3 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                          <p className="text-xs text-amber-700 dark:text-amber-400">
                            Card will be charged the plan price immediately.
                          </p>
                          <Input
                            label="Card Number"
                            value={newCardNumber}
                            onChange={(e) => setNewCardNumber(formatCardNumber(e.target.value))}
                            placeholder="1234 5678 9012 3456"
                          />
                          <div className="grid grid-cols-3 gap-3">
                            <div>
                              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                                Month
                              </label>
                              <select
                                value={newCardExpMonth}
                                onChange={(e) => setNewCardExpMonth(e.target.value)}
                                className="block w-full rounded-lg border-0 px-3.5 py-2.5 text-sm shadow-sm ring-1 ring-inset ring-gray-300 dark:ring-gray-600 focus:ring-2 focus:ring-brand-600 dark:bg-gray-800 dark:text-gray-100"
                              >
                                <option value="">MM</option>
                                {[...Array(12)].map((_, i) => (
                                  <option key={i + 1} value={String(i + 1).padStart(2, "0")}>
                                    {String(i + 1).padStart(2, "0")}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                                Year
                              </label>
                              <select
                                value={newCardExpYear}
                                onChange={(e) => setNewCardExpYear(e.target.value)}
                                className="block w-full rounded-lg border-0 px-3.5 py-2.5 text-sm shadow-sm ring-1 ring-inset ring-gray-300 dark:ring-gray-600 focus:ring-2 focus:ring-brand-600 dark:bg-gray-800 dark:text-gray-100"
                              >
                                <option value="">YY</option>
                                {[...Array(12)].map((_, i) => {
                                  const year = new Date().getFullYear() + i;
                                  return (
                                    <option key={year} value={String(year)}>
                                      {year}
                                    </option>
                                  );
                                })}
                              </select>
                            </div>
                            <Input
                              label="CVV"
                              maxLength={4}
                              value={newCardCvv}
                              onChange={(e) => setNewCardCvv(e.target.value.replace(/\D/g, ""))}
                              placeholder="123"
                            />
                          </div>

                          {/* Save Card Checkbox */}
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              id="saveNewCardCharge"
                              checked={saveNewCard}
                              onChange={(e) => setSaveNewCard(e.target.checked)}
                              className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-600"
                            />
                            <label htmlFor="saveNewCardCharge" className="text-sm text-gray-700 dark:text-gray-300">
                              Save card for future use
                            </label>
                          </div>
                        </div>
                      )}

                      {/* Record Only Mode */}
                      {cardEntryMode === "record" && (
                        <div className="space-y-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700">
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            Records card info for reference only. Use this after processing payment on an external terminal.
                          </p>
                          <div className="grid grid-cols-2 gap-3">
                            <Input
                              label="Last 4 Digits"
                              maxLength={4}
                              value={newCardLast4}
                              onChange={(e) => setNewCardLast4(e.target.value.replace(/\D/g, ""))}
                              placeholder="1234"
                            />
                            <div>
                              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                                Card Brand
                              </label>
                              <select
                                value={newCardBrand}
                                onChange={(e) => setNewCardBrand(e.target.value)}
                                className="block w-full rounded-lg border-0 px-3.5 py-2.5 text-sm shadow-sm ring-1 ring-inset ring-gray-300 dark:ring-gray-600 focus:ring-2 focus:ring-brand-600 dark:bg-gray-800 dark:text-gray-100"
                              >
                                <option value="Visa">Visa</option>
                                <option value="Mastercard">Mastercard</option>
                                <option value="Amex">American Express</option>
                                <option value="Discover">Discover</option>
                              </select>
                            </div>
                          </div>

                          {/* Save Card Checkbox */}
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              id="saveNewCard"
                              checked={saveNewCard}
                              onChange={(e) => setSaveNewCard(e.target.checked)}
                              className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-600"
                            />
                            <label htmlFor="saveNewCard" className="text-sm text-gray-700 dark:text-gray-300">
                              Save card for future use
                            </label>
                          </div>
                        </div>
                      )}

                      {/* Enable Autopay (monthly plans only) */}
                      {saveNewCard && plans.find(p => p.id === selectedPlanId)?.plan_type === "monthly" && (
                        <div className="flex items-center gap-2 ml-6">
                          <input
                            type="checkbox"
                            id="enableAutopay"
                            checked={enableAutopay}
                            onChange={(e) => setEnableAutopay(e.target.checked)}
                            className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-600"
                          />
                          <label htmlFor="enableAutopay" className="text-sm text-gray-700 dark:text-gray-300">
                            Enable auto-renewal with this card
                          </label>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <Button
              variant="secondary"
              onClick={() => {
                setShowAddMembership(false);
                resetMembershipForm();
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleAddMembership}
              loading={addMembershipLoading}
              disabled={
                !selectedPlanId ||
                (chargeNow && paymentMethod === "card" && useExistingCard && !selectedSavedCardId) ||
                (chargeNow && paymentMethod === "card" && !useExistingCard && cardEntryMode === "record" && newCardLast4.length !== 4) ||
                (chargeNow && paymentMethod === "card" && !useExistingCard && cardEntryMode === "charge" && (
                  newCardNumber.replace(/\s/g, "").length < 13 || !newCardExpMonth || !newCardExpYear || newCardCvv.length < 3
                ))
              }
            >
              {chargeNow && paymentMethod === "card" && !useExistingCard && cardEntryMode === "charge"
                ? "Add & Charge Card"
                : chargeNow ? "Add & Charge" : "Add Membership"}
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

      {/* Deactivate Card Confirmation */}
      <ConfirmDialog
        open={!!deactivateCardTarget}
        onClose={() => setDeactivateCardTarget(null)}
        onConfirm={handleDeactivateCard}
        title="Deactivate Card"
        message={`Are you sure you want to deactivate card ${deactivateCardTarget?.rfid_uid}? The card will no longer work for check-ins but can be reactivated later.`}
        confirmLabel="Deactivate"
      />

      {/* Delete Card Confirmation */}
      <ConfirmDialog
        open={!!deleteCardTarget}
        onClose={() => setDeleteCardTarget(null)}
        onConfirm={handleDeleteCard}
        title="Delete Card"
        message={`Are you sure you want to permanently delete card ${deleteCardTarget?.rfid_uid}? This action cannot be undone. The card can be reassigned to another member after deletion.`}
        confirmLabel="Delete"
      />

      {/* Assign Card Modal */}
      <Modal
        open={showAssignCard}
        onClose={() => {
          setShowAssignCard(false);
          setNewCardUid("");
        }}
        title="Assign RFID Card"
        size="sm"
      >
        <div className="space-y-4">
          {/* NFC Connection Status */}
          <div className="flex items-center gap-2 text-sm">
            {nfcConnected ? (
              <>
                <Wifi className="h-4 w-4 text-green-500" />
                <span className="text-green-600 dark:text-green-400">
                  NFC reader connected - tap a card
                </span>
              </>
            ) : (
              <>
                <WifiOff className="h-4 w-4 text-gray-400" />
                <span className="text-gray-500 dark:text-gray-400">
                  NFC reader not connected
                </span>
              </>
            )}
          </div>

          {/* Scan Instructions */}
          <div className="rounded-lg border border-dashed border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 p-6 text-center">
            <CreditCard className="mx-auto h-10 w-10 text-gray-400 dark:text-gray-500 mb-3" />
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {nfcConnected
                ? "Tap a card on the NFC reader at the kiosk"
                : "Enter the card UID manually below"}
            </p>
          </div>

          {/* Manual UID Input */}
          <Input
            label="Card UID"
            value={newCardUid}
            onChange={(e) => setNewCardUid(e.target.value.toUpperCase())}
            placeholder="Enter or scan card UID"
            helpText="UID will appear automatically when a card is scanned"
          />

          <div className="flex justify-end gap-3 pt-2">
            <Button
              variant="secondary"
              onClick={() => {
                setShowAssignCard(false);
                setNewCardUid("");
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleAssignCard}
              loading={assignCardLoading}
              disabled={!newCardUid.trim()}
            >
              Assign Card
            </Button>
          </div>
        </div>
      </Modal>

      {/* Add Saved Payment Card Modal */}
      <Modal
        open={showAddCard}
        onClose={resetAddCardForm}
        title="Add Payment Card"
        size="md"
      >
        <div className="space-y-4">
          {/* Method Selection */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
              How do you want to add the card?
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setAddCardMethod("swipe")}
                className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                  addCardMethod === "swipe"
                    ? "border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-400"
                    : "border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800"
                }`}
              >
                Swipe Card
              </button>
              <button
                type="button"
                onClick={() => setAddCardMethod("hosted")}
                className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                  addCardMethod === "hosted"
                    ? "border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-400"
                    : "border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800"
                }`}
              >
                Enter Card
              </button>
              <button
                type="button"
                onClick={() => setAddCardMethod("manual")}
                className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                  addCardMethod === "manual"
                    ? "border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-400"
                    : "border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800"
                }`}
              >
                Record Only
              </button>
            </div>
          </div>

          {/* Swipe Card Method */}
          {addCardMethod === "swipe" && (
            <div className="space-y-3">
              <div className="rounded-lg border border-dashed border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 p-6 text-center">
                <CreditCard className="mx-auto h-10 w-10 text-gray-400 dark:text-gray-500 mb-3" />
                {swipeData ? (
                  <div>
                    <p className="text-sm font-medium text-green-600 dark:text-green-400">
                      Card swiped successfully
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      Card data captured. Click Save to tokenize.
                    </p>
                  </div>
                ) : (
                  <div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Swipe the card through the card reader
                    </p>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                      The card data will be captured automatically
                    </p>
                  </div>
                )}
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Card will be securely tokenized with HiTech/Converge. The actual card number is never stored.
              </p>
            </div>
          )}

          {/* Hosted/Full Card Entry Method */}
          {addCardMethod === "hosted" && (
            <div className="space-y-3">
              <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-3">
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  Card data is sent directly to HiTech/Converge for tokenization.
                  The card number is never stored on our servers.
                </p>
              </div>
              <Input
                label="Card Number"
                value={fullCardNumber}
                onChange={(e) => setFullCardNumber(e.target.value.replace(/\D/g, ""))}
                placeholder="4111111111111111"
                maxLength={19}
              />
              <Input
                label="Expiry (MMYY)"
                value={fullCardExp}
                onChange={(e) => setFullCardExp(e.target.value.replace(/\D/g, ""))}
                placeholder="1225"
                maxLength={4}
                helpText="Enter as 4 digits: MMYY (e.g., 1225 for Dec 2025)"
              />
            </div>
          )}

          {/* Manual/Record Only Method */}
          {addCardMethod === "manual" && (
            <div className="space-y-3">
              <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 p-3">
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  This only records the card info for reference. The card cannot be charged
                  through our system. Use this after processing payment on an external terminal.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="Last 4 Digits"
                  maxLength={4}
                  value={addCardLast4}
                  onChange={(e) => setAddCardLast4(e.target.value.replace(/\D/g, ""))}
                  placeholder="1234"
                />
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Card Brand
                  </label>
                  <select
                    value={addCardBrand}
                    onChange={(e) => setAddCardBrand(e.target.value)}
                    className="block w-full rounded-lg border-0 px-3.5 py-2.5 text-sm shadow-sm ring-1 ring-inset ring-gray-300 dark:ring-gray-600 focus:ring-2 focus:ring-brand-600 dark:bg-gray-800 dark:text-gray-100"
                  >
                    <option value="Visa">Visa</option>
                    <option value="Mastercard">Mastercard</option>
                    <option value="Amex">American Express</option>
                    <option value="Discover">Discover</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* Card Nickname (all methods) */}
          <Input
            label="Card Nickname (optional)"
            value={addCardName}
            onChange={(e) => setAddCardName(e.target.value)}
            placeholder="e.g., Personal Card, Work Card"
          />

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={resetAddCardForm}>
              Cancel
            </Button>
            <Button
              onClick={handleAddCard}
              loading={addCardLoading}
              disabled={
                (addCardMethod === "swipe" && !swipeData) ||
                (addCardMethod === "hosted" && (fullCardNumber.length < 13 || fullCardExp.length !== 4)) ||
                (addCardMethod === "manual" && addCardLast4.length !== 4)
              }
            >
              {addCardMethod === "manual" ? "Record Card" : "Save Card"}
            </Button>
          </div>
        </div>
      </Modal>
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
