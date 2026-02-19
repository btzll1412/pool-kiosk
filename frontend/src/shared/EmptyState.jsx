import { Inbox } from "lucide-react";
import Button from "./Button";

export default function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  actionLabel,
  onAction,
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-200 bg-white px-6 py-16 text-center dark:border-gray-700 dark:bg-gray-800">
      <Icon className="h-12 w-12 text-gray-300 dark:text-gray-600" strokeWidth={1.5} />
      <h3 className="mt-4 text-sm font-semibold text-gray-900 dark:text-gray-100">{title}</h3>
      {description && (
        <p className="mt-1.5 text-sm text-gray-500 dark:text-gray-400">{description}</p>
      )}
      {actionLabel && onAction && (
        <div className="mt-5">
          <Button onClick={onAction}>{actionLabel}</Button>
        </div>
      )}
    </div>
  );
}
