export default function Card({ children, className = "", padding = true }) {
  return (
    <div
      className={`rounded-xl border border-gray-200 bg-white shadow-sm ${
        padding ? "p-6" : ""
      } ${className}`}
    >
      {children}
    </div>
  );
}

export function CardHeader({ title, description, action }) {
  return (
    <div className="mb-5 flex items-center justify-between">
      <div>
        <h3 className="text-base font-semibold text-gray-900">{title}</h3>
        {description && (
          <p className="mt-0.5 text-sm text-gray-500">{description}</p>
        )}
      </div>
      {action && <div>{action}</div>}
    </div>
  );
}
