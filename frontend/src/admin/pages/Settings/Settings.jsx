import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Database, Download, Eye, EyeOff, Monitor, Save, Send, Settings2, CreditCard, Bell, Upload } from "lucide-react";
import toast from "react-hot-toast";
import { getSettings, updateSettings, testWebhook, testPaymentConnection, testEmail, testSipCall, uploadKioskBackground, revealSetting } from "../../../api/settings";
import { exportSystem, importSystem } from "../../../api/backup";
import Button from "../../../shared/Button";
import Card, { CardHeader } from "../../../shared/Card";
import PageHeader from "../../../shared/PageHeader";
import { SkeletonLine } from "../../../shared/Skeleton";

const CATEGORIES = [
  { id: "general", label: "General", icon: Settings2 },
  { id: "kiosk", label: "Kiosk Display", icon: Monitor },
  { id: "payments", label: "Payments", icon: CreditCard },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "backup", label: "Backup", icon: Database },
];

const BACKGROUND_COLORS = [
  { value: "#0284c7", label: "Ocean Blue" },
  { value: "#0891b2", label: "Cyan" },
  { value: "#0d9488", label: "Teal" },
  { value: "#059669", label: "Emerald" },
  { value: "#16a34a", label: "Green" },
  { value: "#65a30d", label: "Lime" },
  { value: "#ca8a04", label: "Yellow" },
  { value: "#ea580c", label: "Orange" },
  { value: "#dc2626", label: "Red" },
  { value: "#db2777", label: "Pink" },
  { value: "#9333ea", label: "Purple" },
  { value: "#4f46e5", label: "Indigo" },
  { value: "#1e293b", label: "Slate" },
  { value: "#171717", label: "Black" },
];

const settingGroups = [
  {
    title: "Kiosk Behavior",
    description: "Configure how the kiosk operates",
    category: "general",
    fields: [
      { key: "pool_name", label: "Pool Name", type: "text", helpText: "Displayed on the kiosk welcome screen" },
      { key: "currency_symbol", label: "Currency Symbol", type: "text" },
      {
        key: "timezone", label: "Timezone", type: "select",
        options: [
          { value: "America/New_York", label: "Eastern Time (ET)" },
          { value: "America/Chicago", label: "Central Time (CT)" },
          { value: "America/Denver", label: "Mountain Time (MT)" },
          { value: "America/Los_Angeles", label: "Pacific Time (PT)" },
          { value: "America/Anchorage", label: "Alaska Time (AKT)" },
          { value: "Pacific/Honolulu", label: "Hawaii Time (HST)" },
          { value: "America/Phoenix", label: "Arizona (no DST)" },
          { value: "America/Puerto_Rico", label: "Atlantic Time (AST)" },
          { value: "UTC", label: "UTC" },
          { value: "Europe/London", label: "London (GMT/BST)" },
          { value: "Europe/Paris", label: "Paris (CET)" },
          { value: "Europe/Berlin", label: "Berlin (CET)" },
          { value: "Asia/Tokyo", label: "Tokyo (JST)" },
          { value: "Asia/Shanghai", label: "Shanghai (CST)" },
          { value: "Australia/Sydney", label: "Sydney (AEST)" },
        ],
        helpText: "Timezone used for displaying dates and times"
      },
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
    category: "general",
    fields: [
      { key: "inactivity_timeout_seconds", label: "Inactivity Timeout (seconds)", type: "number", helpText: 'Seconds before "Still Here?" appears' },
      { key: "inactivity_warning_seconds", label: "Warning Duration (seconds)", type: "number", helpText: "Countdown before forced return to idle" },
    ],
  },
  {
    title: "PIN & Security",
    description: "Member PIN configuration",
    category: "general",
    fields: [
      {
        key: "pin_length", label: "PIN Length", type: "select",
        options: [{ value: "4", label: "4 digits" }, { value: "6", label: "6 digits" }],
      },
      { key: "pin_max_attempts", label: "Max PIN Attempts", type: "number", helpText: "Failed attempts before lockout" },
    ],
  },
  {
    title: "Welcome Screen Text",
    description: "Customize the text displayed on the kiosk home screen",
    category: "kiosk",
    fields: [
      { key: "kiosk_welcome_title", label: "Welcome Title", type: "text", helpText: "Use {pool_name} to insert pool name" },
      { key: "kiosk_welcome_subtitle", label: "Subtitle", type: "text" },
      { key: "kiosk_card_instruction", label: "Card Reader Instruction", type: "text" },
      { key: "kiosk_help_text", label: "Help Text (bottom)", type: "text" },
    ],
  },
  {
    title: "Overlay & Lock",
    description: "Display overlay messages or lock the kiosk",
    category: "kiosk",
    fields: [
      { key: "kiosk_locked", label: "Lock Kiosk", type: "toggle", helpText: "When enabled, kiosk shows locked message and disables all interactions" },
      { key: "kiosk_lock_message", label: "Lock Message", type: "text", helpText: "Message shown when kiosk is locked" },
      { key: "kiosk_overlay_enabled", label: "Show Overlay", type: "toggle", helpText: "Display a custom message overlay on the home screen" },
      { key: "kiosk_overlay_text", label: "Overlay Text", type: "textarea", helpText: "Special announcement or notice to display" },
    ],
  },
  {
    title: "Kiosk Hardware",
    description: "Hardware and exit settings",
    category: "kiosk",
    fields: [
      { key: "staff_exit_pin", label: "Staff Exit PIN", type: "password", helpText: "PIN to exit kiosk mode (tap bottom-left corner 5 times to access)" },
    ],
  },
  {
    title: "Background",
    description: "Customize the kiosk background appearance",
    category: "kiosk",
    fields: [
      {
        key: "kiosk_bg_type", label: "Background Type", type: "select",
        options: [
          { value: "gradient", label: "Default Gradient" },
          { value: "color", label: "Solid Color" },
          { value: "image", label: "Custom Image" },
        ],
      },
      { key: "kiosk_bg_color", label: "Background Color", type: "color" },
      { key: "kiosk_bg_image", label: "Background Image", type: "image" },
      {
        key: "kiosk_bg_image_mode", label: "Image Display Mode", type: "select",
        options: [
          { value: "cover", label: "Cover (full screen)" },
          { value: "tile", label: "Tile (repeat pattern)" },
        ],
      },
    ],
  },
  {
    title: "Cards & Fees",
    description: "RFID card fee configuration",
    category: "payments",
    fields: [
      { key: "first_card_fee", label: "First Card Fee ($)", type: "number" },
      { key: "replacement_card_fee", label: "Replacement Card Fee ($)", type: "number" },
    ],
  },
  {
    title: "Features",
    description: "Enable or disable features",
    category: "payments",
    fields: [
      { key: "guest_visit_enabled", label: "Guest Visits", type: "toggle", helpText: "Allow walk-in guests without accounts" },
      { key: "split_payment_enabled", label: "Split Payments", type: "toggle", helpText: "Allow splitting between cash and card" },
      { key: "auto_charge_enabled", label: "Auto-Charge / Recurring", type: "toggle", helpText: "Allow members to set up recurring billing" },
    ],
  },
  {
    title: "Payment Processor",
    description: "Select and configure the payment processor",
    category: "payments",
    fields: [
      {
        key: "payment_processor", label: "Active Processor", type: "select",
        options: [
          { value: "stub", label: "Stub (Development)" },
          { value: "stripe", label: "Stripe" },
          { value: "square", label: "Square" },
          { value: "sola", label: "Sola" },
          { value: "hitech", label: "HiTech Merchants" },
          { value: "usaepay", label: "USAePay" },
        ],
      },
    ],
  },
  {
    title: "Stripe Configuration",
    description: "Stripe API credentials",
    category: "payments",
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
    category: "payments",
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
    category: "payments",
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
    title: "HiTech Merchants Configuration",
    description: "HiTech Merchants (Converge) API credentials",
    category: "payments",
    showWhen: (s) => s.payment_processor === "hitech",
    testAction: "hitech",
    fields: [
      { key: "hitech_merchant_id", label: "Merchant ID", type: "text", helpText: "Converge account ID" },
      { key: "hitech_user_id", label: "User ID", type: "text", helpText: "Converge user ID with API access" },
      { key: "hitech_pin", label: "PIN", type: "password", helpText: "64-character terminal identifier" },
      {
        key: "hitech_environment", label: "Environment", type: "select",
        options: [{ value: "sandbox", label: "Sandbox" }, { value: "production", label: "Production" }],
      },
    ],
  },
  {
    title: "USAePay Configuration",
    description: "USAePay API credentials",
    category: "payments",
    showWhen: (s) => s.payment_processor === "usaepay",
    testAction: "usaepay",
    fields: [
      { key: "usaepay_api_key", label: "API Key", type: "password" },
      { key: "usaepay_api_pin", label: "API PIN", type: "password" },
      { key: "usaepay_device_key", label: "Terminal Device Key", type: "text", helpText: "Device key for Castles MP200 terminal (optional, for card-present transactions)" },
      {
        key: "usaepay_environment", label: "Environment", type: "select",
        options: [{ value: "sandbox", label: "Sandbox" }, { value: "production", label: "Production" }],
      },
    ],
  },
  {
    title: "Email (SMTP)",
    description: "Configure outbound email for receipts and notifications",
    category: "notifications",
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
    category: "notifications",
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
    category: "notifications",
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
  const [activeCategory, setActiveCategory] = useState("general");

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

  const filteredGroups = settingGroups.filter(
    (g) => g.category === activeCategory && (!g.showWhen || g.showWhen(settings))
  );

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

      {/* Category Tabs */}
      <div className="mb-6 flex gap-2 border-b border-gray-200 dark:border-gray-700">
        {CATEGORIES.map((cat) => {
          const Icon = cat.icon;
          const isActive = activeCategory === cat.id;
          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => setActiveCategory(cat.id)}
              className={`inline-flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
                isActive
                  ? "border-brand-600 text-brand-600"
                  : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              }`}
            >
              <Icon className="h-4 w-4" />
              {cat.label}
            </button>
          );
        })}
      </div>

      <div className="space-y-6">
        {activeCategory === "backup" ? (
          <BackupRestoreSection />
        ) : (
          filteredGroups.map((group) => (
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
          ))
        )}
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

function SettingField({ field, value, onChange, settings }) {
  const [testing, setTesting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [revealedValue, setRevealedValue] = useState(null);
  const [revealing, setRevealing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const imageInputRef = useRef(null);

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
    const isMasked = value === "••••••••";
    const displayValue = showPassword && revealedValue !== null ? revealedValue : value;

    const handleReveal = async () => {
      if (showPassword) {
        // Hide the password
        setShowPassword(false);
        return;
      }
      // If value is masked, fetch the real value
      if (isMasked && revealedValue === null) {
        setRevealing(true);
        try {
          const result = await revealSetting(field.key);
          setRevealedValue(result.value);
          setShowPassword(true);
        } catch (err) {
          toast.error("Failed to reveal value");
        } finally {
          setRevealing(false);
        }
      } else {
        setShowPassword(true);
      }
    };

    return (
      <div>
        <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">{field.label}</label>
        <div className="relative">
          <input
            type={showPassword ? "text" : "password"}
            value={displayValue}
            onChange={(e) => { onChange(e.target.value); setRevealedValue(null); }}
            className="block w-full rounded-lg border-0 px-3.5 py-2.5 pr-10 text-sm shadow-sm ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-brand-600 dark:bg-gray-800 dark:text-gray-100 dark:ring-gray-600"
          />
          <button
            type="button"
            onClick={handleReveal}
            disabled={revealing}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-50"
          >
            {revealing ? (
              <span className="h-4 w-4 block animate-spin rounded-full border-2 border-gray-400 border-t-transparent" />
            ) : showPassword ? (
              <EyeOff className="h-4 w-4" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
          </button>
        </div>
        {field.helpText && <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{field.helpText}</p>}
      </div>
    );
  }

  if (field.type === "textarea") {
    return (
      <div>
        <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">{field.label}</label>
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          className="block w-full rounded-lg border-0 px-3.5 py-2.5 text-sm shadow-sm ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-brand-600 dark:bg-gray-800 dark:text-gray-100 dark:ring-gray-600"
        />
        {field.helpText && <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{field.helpText}</p>}
      </div>
    );
  }

  if (field.type === "color") {
    return (
      <div>
        <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">{field.label}</label>
        <div className="flex flex-wrap gap-2">
          {BACKGROUND_COLORS.map((color) => (
            <button
              key={color.value}
              type="button"
              onClick={() => onChange(color.value)}
              title={color.label}
              className={`h-10 w-10 rounded-lg transition-all ${value === color.value ? "ring-2 ring-brand-600 ring-offset-2" : "ring-1 ring-gray-200 hover:scale-110"}`}
              style={{ backgroundColor: color.value }}
            />
          ))}
        </div>
        {field.helpText && <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{field.helpText}</p>}
      </div>
    );
  }

  if (field.type === "image") {
    const handleUpload = async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setUploading(true);
      try {
        const result = await uploadKioskBackground(file);
        onChange(result.url);
        toast.success("Background image uploaded");
      } catch (err) {
        toast.error(err.response?.data?.detail || "Upload failed");
      } finally {
        setUploading(false);
      }
    };

    return (
      <div>
        <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">{field.label}</label>
        <div className="flex items-center gap-4">
          {value && (
            <div className="relative h-20 w-32 overflow-hidden rounded-lg ring-1 ring-gray-200">
              <img src={value} alt="Background" className="h-full w-full object-cover" />
            </div>
          )}
          <div className="flex flex-col gap-2">
            <input
              ref={imageInputRef}
              type="file"
              accept="image/*"
              onChange={handleUpload}
              className="hidden"
            />
            <Button
              variant="secondary"
              size="sm"
              icon={Upload}
              onClick={() => imageInputRef.current?.click()}
              loading={uploading}
            >
              {uploading ? "Uploading..." : "Upload Image"}
            </Button>
            {value && (
              <button
                type="button"
                onClick={() => onChange("")}
                className="text-xs text-red-600 hover:text-red-700"
              >
                Remove Image
              </button>
            )}
          </div>
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

function BackupRestoreSection() {
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const fileInputRef = useRef(null);

  const handleExport = async () => {
    setExporting(true);
    try {
      const data = await exportSystem();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `pool-backup-${new Date().toISOString().split("T")[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("Backup exported successfully");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Export failed");
    } finally {
      setExporting(false);
    }
  };

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setShowConfirm(true);
    }
  };

  const handleImport = async () => {
    if (!selectedFile) return;
    setImporting(true);
    try {
      const result = await importSystem(selectedFile);
      toast.success(`System restored: ${result.stats.members} members, ${result.stats.plans} plans, ${result.stats.transactions} transactions`);
      setShowConfirm(false);
      setSelectedFile(null);
      // Reload page to reflect new data
      setTimeout(() => window.location.reload(), 1500);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Import failed");
    } finally {
      setImporting(false);
    }
  };

  return (
    <>
      <Card>
        <CardHeader
          title="Export System Backup"
          description="Download a complete backup of all system data"
        />
        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Export all members, plans, memberships, transactions, settings, and other data to a JSON file.
            Use this to migrate to a new server or create a backup.
          </p>
          <Button icon={Download} onClick={handleExport} loading={exporting}>
            {exporting ? "Exporting..." : "Export Backup"}
          </Button>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Import System Backup"
          description="Restore system from a backup file"
        />
        <div className="space-y-4">
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950">
            <div className="flex gap-3">
              <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
              <div>
                <p className="text-sm font-medium text-amber-800 dark:text-amber-200">Warning</p>
                <p className="mt-1 text-sm text-amber-700 dark:text-amber-300">
                  Importing a backup will <strong>replace all existing data</strong>. This cannot be undone.
                  Make sure to export a backup of the current system first.
                </p>
              </div>
            </div>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={handleFileSelect}
            className="hidden"
          />
          <Button
            variant="secondary"
            icon={Upload}
            onClick={() => fileInputRef.current?.click()}
          >
            Select Backup File
          </Button>
        </div>
      </Card>

      {/* Confirmation Modal */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-md rounded-2xl bg-white p-6 shadow-xl dark:bg-gray-800">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
              <AlertTriangle className="h-6 w-6 text-red-600 dark:text-red-400" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Confirm System Restore
            </h3>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
              You are about to restore the system from <strong>{selectedFile?.name}</strong>.
              This will permanently replace all current data including members, plans, and transactions.
            </p>
            <div className="mt-6 flex gap-3">
              <Button
                variant="secondary"
                onClick={() => {
                  setShowConfirm(false);
                  setSelectedFile(null);
                }}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                onClick={handleImport}
                loading={importing}
                className="flex-1"
              >
                {importing ? "Restoring..." : "Restore System"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
