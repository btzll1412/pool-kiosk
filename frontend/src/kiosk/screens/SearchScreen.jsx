import { useState } from "react";
import { ArrowLeft, Loader2, Search } from "lucide-react";
import toast from "react-hot-toast";
import { searchMembers } from "../../api/kiosk";
import KioskInput from "../components/KioskInput";

export default function SearchScreen({ setMember, goTo, goIdle }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  function handleQueryChange(e) {
    const value = e.target.value;
    setQuery(value);
    
    // Only search after 3+ characters
    if (value.trim().length >= 3) {
      setLoading(true);
      setHasSearched(true);
      searchMembers(value.trim())
        .then(setResults)
        .catch((err) => toast.error(err.response?.data?.detail || "Search failed"))
        .finally(() => setLoading(false));
    } else {
      setResults([]);
      setHasSearched(false);
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

      <div className="flex flex-1 flex-col items-center px-6 py-8 overflow-y-auto">
        <div className="w-full max-w-lg">
          <KioskInput
            value={query}
            onChange={handleQueryChange}
            placeholder="Enter your name or phone number..."
            icon={Search}
          />

          <div className="mt-6">
            {!hasSearched && query.trim().length < 3 ? (
              <div className="rounded-2xl bg-white p-8 text-center shadow-sm ring-1 ring-gray-100">
                <Search className="mx-auto h-10 w-10 text-brand-400" />
                <p className="mt-3 text-lg font-semibold text-gray-900">
                  Please search for your account
                </p>
                <p className="mt-1 text-sm text-gray-500">
                  Enter at least 3 characters to search
                </p>
              </div>
            ) : loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-brand-500" />
              </div>
            ) : results.length === 0 ? (
              <div className="rounded-2xl bg-white p-8 text-center shadow-sm ring-1 ring-gray-100">
                <Search className="mx-auto h-10 w-10 text-gray-300" />
                <p className="mt-3 text-lg font-semibold text-gray-900">
                  No results found
                </p>
                <p className="mt-1 text-sm text-gray-500">
                  Try a different name or phone number
                </p>
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
        </div>
      </div>
    </div>
  );
}
