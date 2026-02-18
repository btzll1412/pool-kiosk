import { useEffect, useState } from "react";
import { Save, Send } from "lucide-react";
import toast from "react-hot-toast";
import { getSettings, updateSettings, testWebhook } from "../../../api/settings";
import Button from "../../../shared/Button";
import Card, { CardHeader } from "../../../shared/Card";
import PageHeader from "../../../shared/PageHeader";

const settingGroups = [
  {
    title: "Kiosk Behavior",
    description: "Configure how the kiosk operates",
    fields: [
      {
        key: "pool_name",
        label: "Pool Name",
        type: "text",
        helpText: "Displayed on the kiosk welcome screen",
      },
      {
        key: "currency_symbol",
        label: "Currency Symbol",
        type: "text",
      },
      {
        key: "checkin_count_mode",
        label: "Check-in Count Mode",
        type: "select",
        options: [
          { value: "each", label: "Each (count every swipe)" },
          { value: "unique", label: "Unique (count once per day)" },
        ],
      },
      {
        key: "family_max_guests",
        label: "Max Guests per Check-in",
        type: "number",
      },
      {
        key: "checkin_return_seconds",
        label: "Check-in Display Duration (seconds)",
        type: "number",
        helpText: "How long the success screen shows before returning to idle",
      },
    ],
  },
  {
    title: "Inactivity Timer",
    description: "Auto-return to idle screen settings",
    fields: [
      {
        key: "inactivity_timeout_seconds",
        label: "Inactivity Timeout (seconds)",
        type: "number",
        helpText: 'Seconds before "Still Here?" appears',
      },
      {
        key: "inactivity_warning_seconds",
        label: "Warning Duration (seconds)",
        type: "number",
        helpText: "Countdown before forced return to idle",
      },
    ],
  },
  {
    title: "PIN & Security",
    description: "Member PIN configuration",
    fields: [
      {
        key: "pin_length",
        label: "PIN Length",
        type: "select",
        options: [
          { value: "4", label: "4 digits" },
          { value: "6", label: "6 digits" },
        ],
      },
      {
        key: "pin_max_attempts",
        label: "Max PIN Attempts",
        type: "number",
        helpText: "Failed attempts before lockout",
      },
    ],
  },
  {
    title: "Cards & Fees",
    description: "RFID card fee configuration",
    fields: [
      {
        key: "first_card_fee",
        label: "First Card Fee ($)",
        type: "number",
      },
      {
        key: "replacement_card_fee",
        label: "Replacement Card Fee ($)",
        type: "number",
      },
    ],
  },
  {
    title: "Features",
    description: "Enable or disable features",
    fields: [
      {
        key: "guest_visit_enabled",
        label: "Guest Visits",
        type: "toggle",
        helpText: "Allow walk-in guests without accounts",
      },
      {
        key: "split_payment_enabled",
        label: "Split Payments",
        type: "toggle",
        helpText: "Allow splitting between cash and card",
      },
      {
        key: "auto_charge_enabled",
        label: "Auto-Charge / Recurring",
        type: "toggle",
        helpText: "Allow members to set up recurring billing",
      },
    ],
  },
  {
    title: "Notifications & Webhooks",
    description: "Configure webhook URLs for event notifications (e.g. Home Assistant)",
    fields: [
      {
        key: "webhook_change_needed",
        label: "Change Needed",
        type: "webhook",
        eventType: "change_needed",
        helpText: "Fired when a member needs change from a cash payment",
      },
      {
        key: "webhook_checkin",
        label: "Check-in",
        type: "webhook",
        eventType: "checkin",
        helpText: "Fired on every member check-in",
      },
      {
        key: "webhook_membership_expiring",
        label: "Membership Expiring",
        type: "webhook",
        eventType: "membership_expiring",
        helpText: "Fired when a membership is expiring soon (daily check at 07:00)",
      },
      {
        key: "webhook_membership_expired",
        label: "Membership Expired",
        type: "webhook",
        eventType: "membership_expired",
        helpText: "Fired when a membership has expired (daily check at 07:00)",
      },
      {
        key: "webhook_low_balance",
        label: "Low Balance",
        type: "webhook",
        eventType: "low_balance",
        helpText: "Fired when a member's credit balance drops below threshold",
      },
      {
        key: "webhook_auto_charge_success",
        label: "Auto-Charge Success",
        type: "webhook",
        eventType: "auto_charge_success",
        helpText: "Fired after a successful recurring charge",
      },
      {
        key: "webhook_auto_charge_failed",
        label: "Auto-Charge Failed",
        type: "webhook",
        eventType: "auto_charge_failed",
        helpText: "Fired when a recurring charge fails",
      },
      {
        key: "webhook_daily_summary",
        label: "Daily Summary",
        type: "webhook",
        eventType: "daily_summary",
        helpText: "Fired daily at 21:00 with the day's stats",
      },
      {
        key: "low_balance_threshold",
        label: "Low Balance Threshold ($)",
        type: "number",
        helpText: "Balance below this triggers the low_balance webhook",
      },
      {
        key: "membership_expiry_warning_days",
        label: "Expiry Warning Days",
        type: "number",
        helpText: "Days before expiry to fire membership_expiring webhook",
      },
      {
        key: "cash_box_instructions",
        label: "Cash Box Instructions",
        type: "text",
        helpText: "Text shown on the cash payment screen",
      },
    ],
  },
];

export default function Settings() {
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    getSettings()
      .then(setSettings)
      .catch((err) => toast.error(err.response?.data?.detail || "Failed to load settings"))
      .finally(() => setLoading(false));
  }, []);

  const handleChange = (key, value) => {
    setSettings((s) => ({ ...s, [key]: value }));
    setDirty(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const updated = await updateSettings(settings);
      setSettings(updated);
      setDirty(false);
      toast.success("Settings saved successfully");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-brand-600" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Settings"
        description="Configure system behavior and features"
        actions={
          <Button icon={Save} onClick={handleSave} loading={saving} disabled={!dirty}>
            Save Changes
          </Button>
        }
      />

      <div className="space-y-6">
        {settingGroups.map((group) => (
          <Card key={group.title}>
            <CardHeader title={group.title} description={group.description} />
            <div className="space-y-5">
              {group.fields.map((field) => (
                <SettingField
                  key={field.key}
                  field={field}
                  value={settings[field.key] ?? ""}
                  onChange={(val) => handleChange(field.key, val)}
                />
              ))}
            </div>
          </Card>
        ))}
      </div>

      {/* Sticky save bar */}
      {dirty && (
        <div className="fixed bottom-0 left-0 right-0 border-t border-gray-200 bg-white/95 backdrop-blur-sm px-4 py-3 shadow-lg lg:left-64">
          <div className="mx-auto flex max-w-3xl items-center justify-between">
            <p className="text-sm text-gray-600">You have unsaved changes</p>
            <Button icon={Save} onClick={handleSave} loading={saving}>
              Save Changes
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function SettingField({ field, value, onChange }) {
  const [testing, setTesting] = useState(false);

  if (field.type === "toggle") {
    const isOn = value === "true";
    return (
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-700">{field.label}</p>
          {field.helpText && (
            <p className="text-xs text-gray-500">{field.helpText}</p>
          )}
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={isOn}
          onClick={() => onChange(isOn ? "false" : "true")}
          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
            isOn ? "bg-brand-600" : "bg-gray-200"
          }`}
        >
          <span
            className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
              isOn ? "translate-x-5" : "translate-x-0"
            }`}
          />
        </button>
      </div>
    );
  }

  if (field.type === "select") {
    return (
      <div>
        <label className="mb-1.5 block text-sm font-medium text-gray-700">
          {field.label}
        </label>
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="block w-full rounded-lg border-0 px-3.5 py-2.5 text-sm shadow-sm ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-brand-600"
        >
          {field.options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        {field.helpText && (
          <p className="mt-1 text-xs text-gray-500">{field.helpText}</p>
        )}
      </div>
    );
  }

  if (field.type === "webhook") {
    const handleTest = async () => {
      if (!value) {
        toast.error("Enter a webhook URL first");
        return;
      }
      setTesting(true);
      try {
        const result = await testWebhook(field.eventType);
        if (result.success) {
          toast.success(result.message);
        } else {
          toast.error(result.message);
        }
      } catch (err) {
        toast.error(err.response?.data?.detail || "Failed to send test webhook");
      } finally {
        setTesting(false);
      }
    };

    return (
      <div>
        <label className="mb-1.5 block text-sm font-medium text-gray-700">
          {field.label}
        </label>
        <div className="flex gap-2">
          <input
            type="url"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="https://..."
            className="block w-full rounded-lg border-0 px-3.5 py-2.5 text-sm shadow-sm ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-brand-600"
          />
          <button
            type="button"
            onClick={handleTest}
            disabled={testing || !value}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-gray-100 px-3 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Send className="h-4 w-4" />
            {testing ? "Sending..." : "Test"}
          </button>
        </div>
        {field.helpText && (
          <p className="mt-1 text-xs text-gray-500">{field.helpText}</p>
        )}
      </div>
    );
  }

  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-gray-700">
        {field.label}
      </label>
      <input
        type={field.type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="block w-full rounded-lg border-0 px-3.5 py-2.5 text-sm shadow-sm ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-brand-600"
      />
      {field.helpText && (
        <p className="mt-1 text-xs text-gray-500">{field.helpText}</p>
      )}
    </div>
  );
}
