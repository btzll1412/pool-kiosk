import { Loader2 } from "lucide-react";

const variants = {
  primary: "bg-brand-600 text-white hover:bg-brand-700 active:bg-brand-800 shadow-lg shadow-brand-600/25",
  secondary: "bg-white text-gray-700 ring-1 ring-gray-200 hover:bg-gray-50 active:bg-gray-100 shadow-sm",
  success: "bg-emerald-600 text-white hover:bg-emerald-700 active:bg-emerald-800 shadow-lg shadow-emerald-600/25",
  danger: "bg-red-600 text-white hover:bg-red-700 active:bg-red-800 shadow-lg shadow-red-600/25",
  ghost: "text-gray-500 hover:text-gray-700 hover:bg-gray-100",
};

const sizes = {
  md: "px-6 py-3 text-base",
  lg: "px-8 py-4 text-lg",
  xl: "px-10 py-5 text-xl",
};

export default function KioskButton({
  variant = "primary",
  size = "lg",
  loading = false,
  disabled = false,
  icon: Icon,
  children,
  className = "",
  ...props
}) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-3 rounded-2xl font-bold transition-all active:scale-[0.98]
        disabled:pointer-events-none disabled:opacity-50
        ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {loading ? (
        <Loader2 className="h-6 w-6 animate-spin" />
      ) : Icon ? (
        <Icon className="h-6 w-6" />
      ) : null}
      {children}
    </button>
  );
}
