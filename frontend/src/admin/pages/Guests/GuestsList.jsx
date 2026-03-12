import { useEffect, useState } from "react";
import { Calendar, CreditCard, DollarSign, Phone, User, Banknote, ArrowRightLeft } from "lucide-react";
import toast from "react-hot-toast";
import { getGuests, giveChange } from "../../../api/guests";
import { useTimezone, formatDateTime } from "../../../context/TimezoneContext";
import Card from "../../../shared/Card";
import PageHeader from "../../../shared/PageHeader";
import Pagination from "../../../shared/Pagination";
import { SkeletonLine } from "../../../shared/Skeleton";

export default function GuestsList() {
  const timezone = useTimezone();
  const [guests, setGuests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const perPage = 25;

  // Give Change Dialog State
  const [changeDialogOpen, setChangeDialogOpen] = useState(false);
  const [selectedGuest, setSelectedGuest] = useState(null);
  const [changeAmount, setChangeAmount] = useState("");
  const [changePending, setChangePending] = useState(false);

  const fetchGuests = () => {
    setLoading(true);
    getGuests(page, perPage)
      .then((data) => {
        setGuests(data.items);
        setTotal(data.total);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchGuests();
  }, [page]);

  const openChangeDialog = (guest) => {
    setSelectedGuest(guest);
    const remaining = Number(guest.overpayment) - Number(guest.change_given);
    setChangeAmount(remaining.toFixed(2));
    setChangeDialogOpen(true);
  };

  const handleGiveChange = async () => {
    if (!selectedGuest) return;

    const amount = parseFloat(changeAmount);
    if (isNaN(amount) || amount <= 0) {
      toast.error("Please enter a valid amount");
      return;
    }

    const remaining = Number(selectedGuest.overpayment) - Number(selectedGuest.change_given);
    if (amount > remaining) {
      toast.error(`Cannot give more than remaining overpayment ($${remaining.toFixed(2)})`);
      return;
    }

    setChangePending(true);
    try {
      await giveChange(selectedGuest.id, amount);
      toast.success(`$${amount.toFixed(2)} change recorded`);
      setChangeDialogOpen(false);
      setSelectedGuest(null);
      fetchGuests();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to record change");
    } finally {
      setChangePending(false);
    }
  };

  if (loading) {
    return (
      <div>
        <PageHeader title="Guest Visits" description="View all guest check-ins" />
        <Card>
          <div className="space-y-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-center gap-4">
                <SkeletonLine width="w-10" height="h-10" />
                <div className="flex-1 space-y-2">
                  <SkeletonLine width="w-32" height="h-4" />
                  <SkeletonLine width="w-24" height="h-3" />
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Guest Visits" description="View all guest check-ins" />

      {guests.length === 0 ? (
        <Card>
          <div className="py-12 text-center">
            <User className="mx-auto h-12 w-12 text-gray-300" />
            <p className="mt-4 text-lg font-medium text-gray-900 dark:text-gray-100">
              No guest visits yet
            </p>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Guest visits will appear here when they check in at the kiosk.
            </p>
          </div>
        </Card>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead>
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    Guest
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    Phone
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    Plan
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    Payment
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    Date
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {guests.map((guest) => {
                  const planPrice = Number(guest.plan_price) || 0;
                  const amountPaid = Number(guest.amount_paid) || 0;
                  const overpayment = Number(guest.overpayment) || 0;
                  const changeGiven = Number(guest.change_given) || 0;
                  const remainingOverpayment = overpayment - changeGiven;
                  const hasOverpayment = overpayment > 0;

                  return (
                    <tr key={guest.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                      <td className="whitespace-nowrap px-4 py-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 text-sm font-medium text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                            {guest.name.charAt(0).toUpperCase()}
                          </div>
                          <span className="font-medium text-gray-900 dark:text-gray-100">
                            {guest.name}
                          </span>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-4">
                        <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                          <Phone className="h-4 w-4" />
                          {guest.phone || "—"}
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="space-y-1">
                          <div className="font-medium text-gray-900 dark:text-gray-100">
                            {guest.plan_name || "—"}
                          </div>
                          {planPrice > 0 && (
                            <div className="text-sm text-gray-500 dark:text-gray-400">
                              ${planPrice.toFixed(2)}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            {guest.payment_method === "cash" ? (
                              <Banknote className="h-4 w-4 text-emerald-500" />
                            ) : (
                              <CreditCard className="h-4 w-4 text-blue-500" />
                            )}
                            <span className="font-medium text-gray-900 dark:text-gray-100">
                              ${amountPaid.toFixed(2)}
                            </span>
                            <span className="capitalize text-gray-500 dark:text-gray-400">
                              ({guest.payment_method})
                            </span>
                          </div>
                          {hasOverpayment && (
                            <div className="flex items-center gap-2 text-sm">
                              <span className="text-amber-600 dark:text-amber-400">
                                Overpaid: ${overpayment.toFixed(2)}
                              </span>
                              {changeGiven > 0 && (
                                <span className="text-emerald-600 dark:text-emerald-400">
                                  (${changeGiven.toFixed(2)} change given)
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-4">
                        <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
                          <Calendar className="h-4 w-4" />
                          {formatDateTime(guest.created_at, timezone)}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-4">
                        {remainingOverpayment > 0 && guest.payment_method === "cash" && (
                          <button
                            type="button"
                            onClick={() => openChangeDialog(guest)}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-amber-50 px-3 py-1.5 text-sm font-medium text-amber-700 hover:bg-amber-100 dark:bg-amber-900/20 dark:text-amber-400 dark:hover:bg-amber-900/40"
                          >
                            <ArrowRightLeft className="h-4 w-4" />
                            Give Change
                          </button>
                        )}
                        {changeGiven > 0 && remainingOverpayment <= 0 && (
                          <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400">
                            <DollarSign className="h-4 w-4" />
                            Change Given
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {total > perPage && (
            <div className="mt-4 border-t border-gray-100 pt-4 dark:border-gray-700">
              <Pagination
                page={page}
                perPage={perPage}
                total={total}
                onPageChange={setPage}
              />
            </div>
          )}
        </Card>
      )}

      {/* Give Change Dialog */}
      {changeDialogOpen && selectedGuest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl dark:bg-gray-800">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Give Change
            </h3>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Record change given to {selectedGuest.name}
            </p>

            <div className="mt-4 space-y-3 rounded-lg bg-gray-50 p-4 dark:bg-gray-700/50">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500 dark:text-gray-400">Plan</span>
                <span className="font-medium text-gray-900 dark:text-gray-100">
                  {selectedGuest.plan_name}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500 dark:text-gray-400">Plan Price</span>
                <span className="font-medium text-gray-900 dark:text-gray-100">
                  ${Number(selectedGuest.plan_price).toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500 dark:text-gray-400">Amount Paid</span>
                <span className="font-medium text-gray-900 dark:text-gray-100">
                  ${Number(selectedGuest.amount_paid).toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500 dark:text-gray-400">Overpayment</span>
                <span className="font-medium text-amber-600 dark:text-amber-400">
                  ${Number(selectedGuest.overpayment).toFixed(2)}
                </span>
              </div>
              {Number(selectedGuest.change_given) > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500 dark:text-gray-400">Already Given</span>
                  <span className="font-medium text-emerald-600 dark:text-emerald-400">
                    ${Number(selectedGuest.change_given).toFixed(2)}
                  </span>
                </div>
              )}
              <div className="border-t border-gray-200 pt-3 dark:border-gray-600">
                <div className="flex justify-between text-sm font-semibold">
                  <span className="text-gray-700 dark:text-gray-300">Remaining</span>
                  <span className="text-amber-600 dark:text-amber-400">
                    ${(Number(selectedGuest.overpayment) - Number(selectedGuest.change_given)).toFixed(2)}
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Amount to Give Back
              </label>
              <div className="relative mt-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  max={Number(selectedGuest.overpayment) - Number(selectedGuest.change_given)}
                  value={changeAmount}
                  onChange={(e) => setChangeAmount(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 py-2 pl-7 pr-4 text-lg font-medium focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                  placeholder="0.00"
                />
              </div>
            </div>

            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => {
                  setChangeDialogOpen(false);
                  setSelectedGuest(null);
                }}
                className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                disabled={changePending}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleGiveChange}
                disabled={changePending}
                className="flex-1 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
              >
                {changePending ? "Recording..." : "Record Change"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
