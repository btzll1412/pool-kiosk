import { useEffect, useState } from "react";
import {
  ArrowLeft,
  CreditCard,
  Edit3,
  Plus,
  RefreshCw,
  Star,
  Trash2,
  Zap,
} from "lucide-react";
import toast from "react-hot-toast";
import KioskButton from "../components/KioskButton";
import {
  deleteSavedCard,
  getSavedCards,
  setDefaultCard,
  updateSavedCard,
} from "../../api/kiosk";

export default function SavedCardsScreen({ member, goTo, context }) {
  const pin = context.pin;
  const [cards, setCards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState("");

  useEffect(() => {
    loadCards();
  }, []);

  async function loadCards() {
    setLoading(true);
    try {
      const data = await getSavedCards(member.member_id, pin);
      setCards(data);
    } catch {
      toast.error("Failed to load saved cards");
    } finally {
      setLoading(false);
    }
  }

  async function handleSetDefault(cardId) {
    try {
      await setDefaultCard(cardId, member.member_id, pin);
      toast.success("Default card updated");
      loadCards();
    } catch {
      toast.error("Failed to set default card");
    }
  }

  async function handleDelete(cardId) {
    try {
      await deleteSavedCard(cardId, member.member_id, pin);
      toast.success("Card removed");
      loadCards();
    } catch {
      toast.error("Failed to remove card");
    }
  }

  async function handleRename(cardId) {
    if (!editName.trim()) return;
    try {
      await updateSavedCard(cardId, editName.trim());
      toast.success("Card renamed");
      setEditingId(null);
      setEditName("");
      loadCards();
    } catch {
      toast.error("Failed to rename card");
    }
  }

  function startEdit(card) {
    setEditingId(card.id);
    setEditName(card.friendly_name || "");
  }

  const brandIcon = (brand) => {
    const b = (brand || "").toLowerCase();
    if (b.includes("visa")) return "V";
    if (b.includes("master")) return "M";
    if (b.includes("amex")) return "A";
    return "C";
  };

  return (
    <div className="flex h-full flex-col bg-gray-50">
      <div className="flex items-center justify-between border-b border-gray-100 bg-white px-6 py-4">
        <button
          type="button"
          onClick={() => goTo("manage", { pin })}
          className="flex items-center gap-2 rounded-xl px-4 py-2 text-gray-500 transition-all hover:bg-gray-100 active:bg-gray-200"
        >
          <ArrowLeft className="h-5 w-5" />
          <span className="font-medium">Back</span>
        </button>
        <h1 className="text-lg font-bold text-gray-900">Saved Cards</h1>
        <button
          type="button"
          onClick={loadCards}
          className="rounded-xl px-4 py-2 text-gray-400 hover:bg-gray-100"
        >
          <RefreshCw className="h-5 w-5" />
        </button>
      </div>

      <div className="flex flex-1 flex-col overflow-y-auto px-6 py-6">
        <div className="mx-auto w-full max-w-lg space-y-3">
          {loading ? (
            <div className="flex h-40 items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-brand-600" />
            </div>
          ) : cards.length === 0 ? (
            <div className="rounded-2xl bg-white p-8 text-center shadow-sm ring-1 ring-gray-100">
              <CreditCard className="mx-auto h-12 w-12 text-gray-300" />
              <p className="mt-4 text-lg font-medium text-gray-500">
                No saved cards yet
              </p>
              <p className="mt-1 text-sm text-gray-400">
                Add a card to speed up future payments
              </p>
            </div>
          ) : (
            cards.map((card) => (
              <div
                key={card.id}
                className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-100"
              >
                <div className="flex items-start gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-50 text-lg font-bold text-brand-600">
                    {brandIcon(card.card_brand)}
                  </div>
                  <div className="flex-1 min-w-0">
                    {editingId === card.id ? (
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && handleRename(card.id)}
                          className="flex-1 rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                          autoFocus
                        />
                        <button
                          type="button"
                          onClick={() => handleRename(card.id)}
                          className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white"
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingId(null)}
                          className="rounded-lg px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-100"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-gray-900 truncate">
                            {card.friendly_name || `Card ending ${card.card_last4}`}
                          </p>
                          {card.is_default && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                              <Star className="h-3 w-3" /> Default
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 text-sm text-gray-500">
                          {card.card_brand || "Card"} **** {card.card_last4}
                        </p>
                      </>
                    )}

                    {card.auto_charge_enabled && (
                      <div className="mt-2 flex items-center gap-1.5 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-xs font-medium text-emerald-700">
                        <Zap className="h-3.5 w-3.5" />
                        Auto-charge: {card.auto_charge_plan_name}
                        {card.next_charge_date && (
                          <span className="text-emerald-500">
                            &middot; Next: {card.next_charge_date}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {editingId !== card.id && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => startEdit(card)}
                      className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-gray-600 ring-1 ring-gray-200 hover:bg-gray-50 active:bg-gray-100"
                    >
                      <Edit3 className="h-3.5 w-3.5" /> Rename
                    </button>
                    {!card.is_default && (
                      <button
                        type="button"
                        onClick={() => handleSetDefault(card.id)}
                        className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-amber-700 ring-1 ring-amber-200 hover:bg-amber-50 active:bg-amber-100"
                      >
                        <Star className="h-3.5 w-3.5" /> Set Default
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => goTo("autoCharge", { pin, savedCard: card })}
                      className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-emerald-700 ring-1 ring-emerald-200 hover:bg-emerald-50 active:bg-emerald-100"
                    >
                      <Zap className="h-3.5 w-3.5" />
                      {card.auto_charge_enabled ? "Manage Auto-Charge" : "Auto-Charge"}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(card.id)}
                      className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-red-600 ring-1 ring-red-200 hover:bg-red-50 active:bg-red-100"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Remove
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      <div className="border-t border-gray-100 bg-white px-6 py-4">
        <div className="mx-auto max-w-lg">
          <KioskButton
            variant="primary"
            size="lg"
            icon={Plus}
            onClick={() => goTo("addCard", { pin })}
            className="w-full"
          >
            Add New Card
          </KioskButton>
        </div>
      </div>
    </div>
  );
}
