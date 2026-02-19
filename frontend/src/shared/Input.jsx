import { forwardRef } from "react";

const Input = forwardRef(function Input(
  { label, error, helpText, className = "", ...props },
  ref
) {
  return (
    <div className={className}>
      {label && (
        <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
          {label}
        </label>
      )}
      <input
        ref={ref}
        className={`block w-full rounded-lg border-0 px-3.5 py-2.5 text-sm text-gray-900 shadow-sm ring-1 ring-inset placeholder:text-gray-400 focus:ring-2 focus:ring-inset transition-shadow dark:bg-gray-800 dark:text-gray-100 dark:placeholder:text-gray-500 ${
          error
            ? "ring-red-300 focus:ring-red-500"
            : "ring-gray-300 focus:ring-brand-600 dark:ring-gray-600"
        }`}
        {...props}
      />
      {error && <p className="mt-1.5 text-xs text-red-600 dark:text-red-400">{error}</p>}
      {helpText && !error && (
        <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">{helpText}</p>
      )}
    </div>
  );
});

export default Input;
