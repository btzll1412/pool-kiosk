import { useState } from "react";
import { ArrowLeft, Loader2, Search, User } from "lucide-react";
import toast from "react-hot-toast";
import KioskButton from "../components/KioskButton";
import { searchMembers } from "../../api/kiosk";

export default function SearchScreen({ setMember, goTo, goIdle }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);

  async function handleSearch(e) {
    e.preventDefault();
    if (query.trim().length < 2) {
      toast.error("Enter at least 2 characters");
      return;
    }
    setLoading(true);
    try {
      const data = await searchMembers(query.trim());
      setResults(data);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Search failed");
    } finally {
      setLoading(false);
    }
  }

  function selectMember(m) {
    setMember(m);
    goTo("member");
  }

  return (
    <div className="flex h-full flex-col bg-gray-50">
      <div className="flex items-center justify-between border-b border-gray-100 bg-white px-6 py-4">
        <button
          type="button"
          onClick={goIdle}
          className="flex items-center gap-2 rounded-xl px-4 py-2 text-gray-500 transition-all hover:bg-gray-100 active:bg-gray-200"
        >
          <ArrowLeft className="h-5 w-5" />
          <span className="font-medium">Back</span>
        </button>
        <h1 className="text-lg font-bold text-gray-900">Find Your Account</h1>
        <div className="w-24" />
      </div>

      <div className="flex flex-1 flex-col items-center px-6 py-8">
        <div className="w-full max-w-lg">
          <form onSubmit={handleSearch} className="flex gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Name or phone number"
                autoFocus
                className="w-full rounded-2xl border-0 bg-white py-4 pl-12 pr-4 text-lg font-medium text-gray-900 shadow-sm ring-1 ring-gray-200 placeholder:text-gray-400 focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <KioskButton
              variant="primary"
              size="lg"
              loading={loading}
              onClick={handleSearch}
              className="rounded-2xl"
            >
              Search
            </KioskButton>
          </form>

          {results !== null && (
            <div className="mt-6">
              {results.length === 0 ? (
                <div className="rounded-2xl bg-white p-8 text-center shadow-sm ring-1 ring-gray-100">
                  <Search className="mx-auto h-10 w-10 text-gray-300" />
                  <p className="mt-3 text-lg font-semibold text-gray-900">No results found</p>
                  <p className="mt-1 text-sm text-gray-500">Try a different name or phone number</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {results.map((m) => (
                    <button
                      key={m.member_id}
                      type="button"
                      onClick={() => selectMember(m)}
                      className="flex w-full items-center gap-4 rounded-2xl bg-white p-5 text-left shadow-sm ring-1 ring-gray-100 transition-all hover:ring-brand-300 hover:shadow-md active:scale-[0.99]"
                    >
                      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-100 text-lg font-bold text-brand-700">
                        {m.first_name?.[0]}{m.last_name?.[0]}
                      </div>
                      <div className="flex-1">
                        <p className="text-lg font-semibold text-gray-900">
                          {m.first_name} {m.last_name}
                        </p>
                        <p className="text-sm text-gray-500">
                          {m.active_membership
                            ? m.active_membership.plan_name
                            : "No active plan"}
                        </p>
                      </div>
                      <div
                        className={`h-3 w-3 rounded-full ${
                          m.is_frozen
                            ? "bg-blue-500"
                            : m.active_membership
                              ? "bg-emerald-500"
                              : "bg-amber-500"
                        }`}
                      />
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
