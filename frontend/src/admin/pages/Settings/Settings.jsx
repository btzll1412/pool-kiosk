import { useEffect, useState } from "react";
import { Eye, EyeOff, Save, Send } from "lucide-react";
import toast from "react-hot-toast";
import { getSettings, updateSettings, testWebhook, testPaymentConnection, testEmail, testSipCall } from "../../../api/settings";
import Button from "../../../shared/Button";
import Card, { CardHeader } from "../../../shared/Card";
import PageHeader from "../../../shared/PageHeader";
import { SkeletonLine } from "../../../shared/Skeleton";

const settingGroups = [
  {
    title: "Kiosk Behavior",
    description: "Configure how the kiosk operates",
    fields: [
      { key: "pool_name", label: "Pool Name", type: "text", helpText: "Displayed on the kiosk welcome screen" },
      { key: "currency_symbol", label: "Currency Symbol", type: "text" },
      {
        key: "checkin_count_mode", label: "Check-in Count Mode", type: "select",
        options: [
          { value: "each", label: "Each (count every swipe)" },
          { value: "unique", label: "Unique (count once per day)" },
        ],
      },
      { key: "family_max_guests", label: "Max Guests per Check-in", type: "number" },
      { key: "checkin_return_seconds", label: "Check-in Display Duration (seconds)", type: "number", helpText: "How long the success screen shows before returning to idle" },
    ],
  },
  {
    title: "Inactivity Timer",
    description: "Auto-return to idle screen settings",
    fields: [
      { key: "inactivity_timeout_seconds", label: "Inactivity Timeout (seconds)", type: "number", helpText: 'Seconds before "Still Here?" appears' },
      { key: "inactivity_warning_seconds", label: "Warning Duration (seconds)", type: "number", helpText: "Countdown before forced return to idle" },
    ],
  },
  {
    title: "PIN & Security",
    description: "Member PIN configuration",
    fields: [
      {
        key: "pin_length", label: "PIN Length", type: "select",
        options: [{ value: "4", label: "4 digits" }, { value: "6", label: "6 digits" }],
      },
      { key: "pin_max_attempts", label: "Max PIN Attempts", type: "number", helpText: "Failed attempts before lockout" },
    ],
  },
  {
    title: "Cards & Fees",
    description: "RFID card fee configuration",
    fields: [
      { key: "first_card_fee", label: "First Card Fee ($)", type: "number" },
      { key: "replacement_card_fee", label: "Replacement Card Fee ($)", type: "number" },
    ],
  },
  {
    title: "Features",
    description: "Enable or disable features",
    fields: [
      { key: "guest_visit_enabled", label: "Guest Visits", type: "toggle", helpText: "Allow walk-in guests without accounts" },
      { key: "split_payment_enabled", label: "Split Payments", type: "toggle", helpText: "Allow splitting between cash and card" },
      { key: "auto_charge_enabled", label: "Auto-Charge / Recurring", type: "toggle", helpText: "Allow members to set up recurring billing" },
    ],
  },
  {
    title: "Payment Processor",
    description: "Select and configure the payment processor",
    fields: [
      {
        key: "payment_processor", label: "Active Processor", type: "select",
        options: [
          { value: "stub", label: "Stub (Development)" },
          { value: "stripe", label: "Stripe" },
          { value: "square", label: "Square" },
          { value: "sola", label: "Sola" },
        ],
      },
    ],
  },
  {
    title: "Stripe Configuration",
    description: "Stripe API credentials",
    showWhen: (s) => s.payment_processor === "stripe",
    testAction: "stripe",
    fields: [
      { key: "stripe_api_key", label: "Publishable Key", type: "password" },
      { key: "stripe_secret_key", label: "Secret Key", type: "password" },
      { key: "stripe_webhook_secret", label: "Webhook Secret", type: "password", helpText: "For verifying Stripe webhook events" },
    ],
  },
  {
    title: "Square Configuration",
    description: "Square API credentials",
    showWhen: (s) => s.payment_processor === "square",
    testAction: "square",
    fields: [
      { key: "square_access_token", label: "Access Token", type: "password" },
      { key: "square_location_id", label: "Location ID", type: "text" },
      {
        key: "square_environment", label: "Environment", type: "select",
        options: [{ value: "sandbox", label: "Sandbox" }, { value: "production", label: "Production" }],
      },
    ],
  },
  {
    title: "Sola Configuration",
    description: "Sola API credentials",
    showWhen: (s) => s.payment_processor === "sola",
    testAction: "sola",
    fields: [
      { key: "sola_api_key", label: "API Key", type: "password" },
      { key: "sola_api_secret", label: "API Secret", type: "password" },
      { key: "sola_merchant_id", label: "Merchant ID", type: "text" },
      {
        key: "sola_environment", label: "Environment", type: "select",
        options: [{ value: "sandbox", label: "Sandbox" }, { value: "production", label: "Production" }],
      },
    ],
  },
  {
    title: "Email (SMTP)",
    description: "Configure outbound email for receipts and notifications",
    testAction: "email",
    fields: [
      { key: "email_smtp_host", label: "SMTP Host", type: "text", helpText: "e.g. smtp.gmail.com" },
      { key: "email_smtp_port", label: "SMTP Port", type: "number" },
      { key: "email_smtp_username", label: "Username", type: "text" },
      { key: "email_smtp_password", label: "Password", type: "password" },
      { key: "email_from_address", label: "From Address", type: "text", helpText: "e.g. pool@example.com" },
      { key: "email_from_name", label: "From Name", type: "text" },
      { key: "email_tls_enabled", label: "TLS Enabled", type: "toggle" },
    ],
  },
  {
    title: "SIP / Phone System",
    description: "FusionPBX integration for staff phone calls",
    testAction: "sip",
    fields: [
      { key: "sip_enabled", label: "SIP Enabled", type: "toggle", helpText: "Enable outbound calls for change notifications" },
      { key: "sip_fusionpbx_api_url", label: "FusionPBX API URL", type: "text", helpText: "e.g. https://pbx.example.com/api" },
      { key: "sip_fusionpbx_api_key", label: "FusionPBX API Key", type: "password" },
      { key: "sip_server", label: "SIP Server", type: "text" },
      { key: "sip_port", label: "SIP Port", type: "number" },
      { key: "sip_username", label: "SIP Username", type: "text" },
      { key: "sip_password", label: "SIP Password", type: "password" },
      { key: "sip_caller_id", label: "Caller ID", type: "text" },
      { key: "sip_change_needed_number", label: "Change Needed Phone #", type: "text", helpText: "Staff number to call when change is needed" },
    ],
  },
  {
    title: "Notifications & Webhooks",
    description: "Configure webhook URLs for event notifications (e.g. Home Assistant)",
    fields: [
      { key: "webhook_change_needed", label: "Change Needed", type: "webhook", eventType: "change_needed", helpText: "Fired when a member needs change from a cash payment" },
      { key: "webhook_checkin", label: "Check-in", type: "webhook", eventType: "checkin", helpText: "Fired on every member check-in" },
      { key: "webhook_membership_expiring", label: "Membership Expiring", type: "webhook", eventType: "membership_expiring", helpText: "Fired when a membership is expiring soon (daily check at 07:00)" },
      { key: "webhook_membership_expired", label: "Membership Expired", type: "webhook", eventType: "membership_expired", helpText: "Fired when a membership has expired (daily check at 07:00)" },
      { key: "webhook_low_balance", label: "Low Balance", type: "webhook", eventType: "low_balance", helpText: "Fired when a member's credit balance drops below threshold" },
      { key: "webhook_auto_charge_success", label: "Auto-Charge Success", type: "webhook", eventType: "auto_charge_success", helpText: "Fired after a successful recurring charge" },
      { key: "webhook_auto_charge_failed", label: "Auto-Charge Failed", type: "webhook", eventType: "auto_charge_failed", helpText: "Fired when a recurring charge fails" },
      { key: "webhook_daily_summary", label: "Daily Summary", type: "webhook", eventType: "daily_summary", helpText: "Fired daily at 21:00 with the day's stats" },
      { key: "low_balance_threshold", label: "Low Balance Threshold ($)", type: "number", helpText: "Balance below this triggers the low_balance webhook" },
      { key: "membership_expiry_warning_days", label: "Expiry Warning Days", type: "number", helpText: "Days before expiry to fire membership_expiring webhook" },
      { key: "cash_box_instructions", label: "Cash Box Instructions", type: "text", helpText: "Text shown on the cash payment screen" },
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
      <div className="mx-auto max-w-3xl">
        <PageHeader title="Settings" description="Configure system behavior and features" />
        <div className="space-y-6">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <SkeletonLine width="w-32" height="h-5" className="mb-4" />
              <div className="space-y-4">
                <SkeletonLine width="w-full" height="h-10" />
                <SkeletonLine width="w-full" height="h-10" />
                <SkeletonLine width="w-3/4" height="h-10" />
              </div>
            </Card>
          ))}
        </div>
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
        {settingGroups.map((group) => {
          if (group.showWhen && !group.showWhen(settings)) return null;
          return (
            <Card key={group.title}>
              <CardHeader
                title={group.title}
                description={group.description}
                action={group.testAction && <TestConnectionButton action={group.testAction} settings={settings} />}
              />
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
          );
        })}
      </div>

      {/* Sticky save bar */}
      {dirty && (
        <div className="fixed bottom-0 left-0 right-0 border-t border-gray-200 bg-white/95 backdrop-blur-sm px-4 py-3 shadow-lg lg:left-64 dark:border-gray-700 dark:bg-gray-900/95">
          <div className="mx-auto flex max-w-3xl items-center justify-between">
            <p className="text-sm text-gray-600 dark:text-gray-400">You have unsaved changes</p>
            <Button icon={Save} onClick={handleSave} loading={saving}>
              Save Changes
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function TestConnectionButton({ action, settings }) {
  const [testing, setTesting] = useState(false);

  const handleTest = async () => {
    setTesting(true);
    try {
      let result;
      if (action === "email") {
        result = await testEmail();
      } else if (action === "sip") {
        result = await testSipCall();
      } else {
        result = await testPaymentConnection(action);
      }
      if (result.success) {
        toast.success(result.message);
      } else {
        toast.error(result.message);
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || "Connection test failed");
    } finally {
      setTesting(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleTest}
      disabled={testing}
      className="inline-flex items-center gap-1.5 rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
    >
      <Send className="h-3.5 w-3.5" />
      {testing ? "Testing..." : "Test Connection"}
    </button>
  );
}

function SettingField({ field, value, onChange }) {
  const [testing, setTesting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  if (field.type === "toggle") {
    const isOn = value === "true";
    return (
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{field.label}</p>
          {field.helpText && <p className="text-xs text-gray-500 dark:text-gray-400">{field.helpText}</p>}
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={isOn}
          onClick={() => onChange(isOn ? "false" : "true")}
          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
            isOn ? "bg-brand-600" : "bg-gray-200 dark:bg-gray-600"
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
        <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
          {field.label}
        </label>
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="block w-full rounded-lg border-0 px-3.5 py-2.5 text-sm shadow-sm ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-brand-600 dark:bg-gray-800 dark:text-gray-100 dark:ring-gray-600"
        >
          {field.options.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        {field.helpText && <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{field.helpText}</p>}
      </div>
    );
  }

  if (field.type === "webhook") {
    const handleTest = async () => {
      if (!value) { toast.error("Enter a webhook URL first"); return; }
      setTesting(true);
      try {
        const result = await testWebhook(field.eventType);
        if (result.success) { toast.success(result.message); }
        else { toast.error(result.message); }
      } catch (err) {
        toast.error(err.response?.data?.detail || "Failed to send test webhook");
      } finally { setTesting(false); }
    };

    return (
      <div>
        <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">{field.label}</label>
        <div className="flex gap-2">
          <input
            type="url"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="https://..."
            className="block w-full rounded-lg border-0 px-3.5 py-2.5 text-sm shadow-sm ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-brand-600 dark:bg-gray-800 dark:text-gray-100 dark:ring-gray-600"
          />
          <button
            type="button"
            onClick={handleTest}
            disabled={testing || !value}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-gray-100 px-3 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
          >
            <Send className="h-4 w-4" />
            {testing ? "Sending..." : "Test"}
          </button>
        </div>
        {field.helpText && <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{field.helpText}</p>}
      </div>
    );
  }

  if (field.type === "password") {
    return (
      <div>
        <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">{field.label}</label>
        <div className="relative">
          <input
            type={showPassword ? "text" : "password"}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="block w-full rounded-lg border-0 px-3.5 py-2.5 pr-10 text-sm shadow-sm ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-brand-600 dark:bg-gray-800 dark:text-gray-100 dark:ring-gray-600"
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        {field.helpText && <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{field.helpText}</p>}
      </div>
    );
  }

  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">{field.label}</label>
      <input
        type={field.type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="block w-full rounded-lg border-0 px-3.5 py-2.5 text-sm shadow-sm ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-brand-600 dark:bg-gray-800 dark:text-gray-100 dark:ring-gray-600"
      />
      {field.helpText && <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{field.helpText}</p>}
    </div>
  );
}
