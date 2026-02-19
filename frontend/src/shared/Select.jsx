export default function Select({
  label,
  options,
  error,
  className = "",
  ...props
}) {
  return (
    <div className={className}>
      {label && (
        <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
          {label}
        </label>
      )}
      <select
        className={`block w-full rounded-lg border-0 px-3.5 py-2.5 text-sm text-gray-900 shadow-sm ring-1 ring-inset placeholder:text-gray-400 focus:ring-2 focus:ring-inset transition-shadow dark:bg-gray-800 dark:text-gray-100 ${
          error
            ? "ring-red-300 focus:ring-red-500"
            : "ring-gray-300 focus:ring-brand-600 dark:ring-gray-600"
        }`}
        {...props}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {error && <p className="mt-1.5 text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
