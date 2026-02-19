import { useEffect, useState } from "react";
import { Calendar, CreditCard, DollarSign, Phone, User } from "lucide-react";
import { getGuests } from "../../../api/guests";
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

  useEffect(() => {
    setLoading(true);
    getGuests(page, perPage)
      .then((data) => {
        setGuests(data.items);
        setTotal(data.total);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [page]);

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
                    Payment
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    Amount
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    Date
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {guests.map((guest) => (
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
                    <td className="whitespace-nowrap px-4 py-4">
                      <div className="flex items-center gap-2">
                        <CreditCard className="h-4 w-4 text-gray-400" />
                        <span className="capitalize text-gray-600 dark:text-gray-400">
                          {guest.payment_method}
                        </span>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-4">
                      <div className="flex items-center gap-2 text-gray-900 dark:text-gray-100">
                        <DollarSign className="h-4 w-4 text-emerald-500" />
                        {Number(guest.amount_paid).toFixed(2)}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-4">
                      <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
                        <Calendar className="h-4 w-4" />
                        {formatDateTime(guest.created_at, timezone)}
                      </div>
                    </td>
                  </tr>
                ))}
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
    </div>
  );
}
