import { useEffect, useState } from "react";
import { Save } from "lucide-react";
import toast from "react-hot-toast";
import { getSettings, updateSettings } from "../../../api/settings";
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
    title: "Notifications",
    description: "External integrations",
    fields: [
      {
        key: "change_notification_webhook",
        label: "Change Notification Webhook URL",
        type: "text",
        helpText: "Home Assistant webhook URL for change requests",
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
    } catch {
      toast.error("Failed to save settings");
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
