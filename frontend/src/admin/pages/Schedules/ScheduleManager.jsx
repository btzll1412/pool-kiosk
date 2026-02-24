import { useEffect, useState } from "react";
import { Calendar, Clock, Plus, Trash2, Edit, AlertTriangle } from "lucide-react";
import toast from "react-hot-toast";
import {
  getSchedules,
  createSchedule,
  updateSchedule,
  deleteSchedule,
  deleteAllSchedules,
  getOverrides,
  createOverride,
  updateOverride,
  deleteOverride,
} from "../../../api/schedules";
import Button from "../../../shared/Button";
import Card from "../../../shared/Card";
import ConfirmDialog from "../../../shared/ConfirmDialog";
import Input from "../../../shared/Input";
import Modal from "../../../shared/Modal";
import PageHeader from "../../../shared/PageHeader";
import { SkeletonCard } from "../../../shared/Skeleton";

const DAYS = [
  { value: 0, label: "Monday", short: "Mon" },
  { value: 1, label: "Tuesday", short: "Tue" },
  { value: 2, label: "Wednesday", short: "Wed" },
  { value: 3, label: "Thursday", short: "Thu" },
  { value: 4, label: "Friday", short: "Fri" },
  { value: 5, label: "Saturday", short: "Sat" },
  { value: 6, label: "Sunday", short: "Sun" },
];

const SCHEDULE_TYPES = [
  { value: "open", label: "Open Swim", color: "bg-green-500", textColor: "text-green-700 dark:text-green-400" },
  { value: "men_only", label: "Men Only", color: "bg-blue-500", textColor: "text-blue-700 dark:text-blue-400" },
  { value: "women_only", label: "Women Only", color: "bg-pink-500", textColor: "text-pink-700 dark:text-pink-400" },
  { value: "lap_swim", label: "Lap Swim", color: "bg-cyan-500", textColor: "text-cyan-700 dark:text-cyan-400" },
  { value: "lessons", label: "Lessons", color: "bg-purple-500", textColor: "text-purple-700 dark:text-purple-400" },
  { value: "maintenance", label: "Maintenance", color: "bg-orange-500", textColor: "text-orange-700 dark:text-orange-400" },
  { value: "closed", label: "Closed", color: "bg-gray-500", textColor: "text-gray-700 dark:text-gray-400" },
];

function getTypeInfo(type) {
  return SCHEDULE_TYPES.find((t) => t.value === type) || SCHEDULE_TYPES[0];
}

function formatTime(timeStr) {
  if (!timeStr) return "";
  const [hours, minutes] = timeStr.split(":");
  const h = parseInt(hours, 10);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12}:${minutes} ${ampm}`;
}

function formatDateTime(isoStr) {
  if (!isoStr) return "";
  const d = new Date(isoStr);
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function toLocalDateTimeString(date) {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hours = String(d.getHours()).padStart(2, "0");
  const mins = String(d.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${mins}`;
}

export default function ScheduleManager() {
  const [schedules, setSchedules] = useState([]);
  const [overrides, setOverrides] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [showClearAll, setShowClearAll] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("weekly"); // "weekly" or "overrides"

  // Schedule Form state
  const [formName, setFormName] = useState("");
  const [formType, setFormType] = useState("open");
  const [formDay, setFormDay] = useState(0);
  const [formStartTime, setFormStartTime] = useState("09:00");
  const [formEndTime, setFormEndTime] = useState("17:00");
  const [formNotes, setFormNotes] = useState("");
  const [formActive, setFormActive] = useState(true);

  // Override Form state
  const [showOverrideModal, setShowOverrideModal] = useState(false);
  const [editingOverride, setEditingOverride] = useState(null);
  const [ovName, setOvName] = useState("");
  const [ovType, setOvType] = useState("open");
  const [ovStartDateTime, setOvStartDateTime] = useState("");
  const [ovEndDateTime, setOvEndDateTime] = useState("");
  const [ovNotes, setOvNotes] = useState("");
  const [ovActive, setOvActive] = useState(true);
  const [deleteOverrideTarget, setDeleteOverrideTarget] = useState(null);

  const load = () => {
    setLoading(true);
    Promise.all([getSchedules(), getOverrides()])
      .then(([schedData, ovData]) => {
        setSchedules(schedData);
        setOverrides(ovData);
      })
      .catch((err) => toast.error(err.response?.data?.detail || "Failed to load schedules"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const resetForm = () => {
    setFormName("");
    setFormType("open");
    setFormDay(0);
    setFormStartTime("09:00");
    setFormEndTime("17:00");
    setFormNotes("");
    setFormActive(true);
    setEditingSchedule(null);
  };

  const resetOverrideForm = () => {
    setOvName("");
    setOvType("open");
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    setOvStartDateTime(toLocalDateTimeString(now));
    setOvEndDateTime(toLocalDateTimeString(tomorrow));
    setOvNotes("");
    setOvActive(true);
    setEditingOverride(null);
  };

  const openCreate = () => {
    resetForm();
    setShowModal(true);
  };

  const openEdit = (schedule) => {
    setEditingSchedule(schedule);
    setFormName(schedule.name);
    setFormType(schedule.schedule_type);
    setFormDay(schedule.day_of_week);
    setFormStartTime(schedule.start_time);
    setFormEndTime(schedule.end_time);
    setFormNotes(schedule.notes || "");
    setFormActive(schedule.is_active);
    setShowModal(true);
  };

  const openCreateOverride = () => {
    resetOverrideForm();
    setShowOverrideModal(true);
  };

  const openEditOverride = (ov) => {
    setEditingOverride(ov);
    setOvName(ov.name);
    setOvType(ov.schedule_type);
    setOvStartDateTime(toLocalDateTimeString(new Date(ov.start_datetime)));
    setOvEndDateTime(toLocalDateTimeString(new Date(ov.end_datetime)));
    setOvNotes(ov.notes || "");
    setOvActive(ov.is_active);
    setShowOverrideModal(true);
  };

  const handleSave = async () => {
    if (!formName.trim()) {
      toast.error("Please enter a name");
      return;
    }
    if (formStartTime >= formEndTime) {
      toast.error("Start time must be before end time");
      return;
    }

    setSaving(true);
    try {
      const data = {
        name: formName,
        schedule_type: formType,
        day_of_week: formDay,
        start_time: formStartTime,
        end_time: formEndTime,
        notes: formNotes || null,
        is_active: formActive,
        priority: 0,
      };

      if (editingSchedule) {
        await updateSchedule(editingSchedule.id, data);
        toast.success("Schedule updated");
      } else {
        await createSchedule(data);
        toast.success("Schedule created");
      }

      setShowModal(false);
      resetForm();
      load();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to save schedule");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveOverride = async () => {
    if (!ovName.trim()) {
      toast.error("Please enter a name");
      return;
    }
    if (!ovStartDateTime || !ovEndDateTime) {
      toast.error("Please enter start and end date/time");
      return;
    }
    if (new Date(ovStartDateTime) >= new Date(ovEndDateTime)) {
      toast.error("Start must be before end");
      return;
    }

    setSaving(true);
    try {
      const data = {
        name: ovName,
        schedule_type: ovType,
        start_datetime: new Date(ovStartDateTime).toISOString(),
        end_datetime: new Date(ovEndDateTime).toISOString(),
        notes: ovNotes || null,
        is_active: ovActive,
      };

      if (editingOverride) {
        await updateOverride(editingOverride.id, data);
        toast.success("Override updated");
      } else {
        await createOverride(data);
        toast.success("Override created");
      }

      setShowOverrideModal(false);
      resetOverrideForm();
      load();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to save override");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteSchedule(deleteTarget.id);
      toast.success("Schedule deleted");
      setDeleteTarget(null);
      load();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to delete schedule");
    }
  };

  const handleDeleteOverride = async () => {
    if (!deleteOverrideTarget) return;
    try {
      await deleteOverride(deleteOverrideTarget.id);
      toast.success("Override deleted");
      setDeleteOverrideTarget(null);
      load();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to delete override");
    }
  };

  const handleClearAll = async () => {
    try {
      await deleteAllSchedules();
      toast.success("All schedules cleared");
      setShowClearAll(false);
      load();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to clear schedules");
    }
  };

  // Group schedules by day
  const schedulesByDay = DAYS.map((day) => ({
    ...day,
    schedules: schedules
      .filter((s) => s.day_of_week === day.value)
      .sort((a, b) => a.start_time.localeCompare(b.start_time)),
  }));

  // Check for active override
  const now = new Date();
  const activeOverride = overrides.find(
    (ov) => ov.is_active && new Date(ov.start_datetime) <= now && new Date(ov.end_datetime) > now
  );

  if (loading) {
    return (
      <div>
        <PageHeader title="Pool Schedule" description="Manage pool hours and schedule" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Pool Schedule"
        description="Manage pool hours and schedule"
        actions={
          <div className="flex gap-2">
            {activeTab === "weekly" && schedules.length > 0 && (
              <Button variant="danger" onClick={() => setShowClearAll(true)}>
                Clear All
              </Button>
            )}
            {activeTab === "weekly" && (
              <Button icon={Plus} onClick={openCreate}>
                Add Time Block
              </Button>
            )}
            {activeTab === "overrides" && (
              <Button icon={Plus} onClick={openCreateOverride}>
                Add Override
              </Button>
            )}
          </div>
        }
      />

      {/* Active Override Warning */}
      {activeOverride && (
        <div className="mb-6 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-500 mt-0.5" />
            <div>
              <p className="font-medium text-amber-800 dark:text-amber-300">
                Schedule Override Active
              </p>
              <p className="text-sm text-amber-700 dark:text-amber-400">
                <strong>{activeOverride.name}</strong> ({getTypeInfo(activeOverride.schedule_type).label})
                is overriding the regular schedule until {formatDateTime(activeOverride.end_datetime)}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="mb-6 border-b border-gray-200 dark:border-gray-700">
        <nav className="flex gap-4">
          <button
            onClick={() => setActiveTab("weekly")}
            className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === "weekly"
                ? "border-brand-600 text-brand-600"
                : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400"
            }`}
          >
            <Calendar className="inline h-4 w-4 mr-1.5" />
            Weekly Schedule
          </button>
          <button
            onClick={() => setActiveTab("overrides")}
            className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === "overrides"
                ? "border-brand-600 text-brand-600"
                : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400"
            }`}
          >
            <AlertTriangle className="inline h-4 w-4 mr-1.5" />
            Special Overrides
            {overrides.length > 0 && (
              <span className="ml-2 rounded-full bg-gray-200 dark:bg-gray-700 px-2 py-0.5 text-xs">
                {overrides.length}
              </span>
            )}
          </button>
        </nav>
      </div>

      {/* Weekly Schedule Tab */}
      {activeTab === "weekly" && (
        <>
          {/* Legend */}
          <div className="mb-6 flex flex-wrap gap-3">
            {SCHEDULE_TYPES.map((type) => (
              <div key={type.value} className="flex items-center gap-2">
                <div className={`h-3 w-3 rounded-full ${type.color}`} />
                <span className="text-sm text-gray-600 dark:text-gray-400">{type.label}</span>
              </div>
            ))}
          </div>

          {/* Weekly View */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {schedulesByDay.map((day) => (
              <Card key={day.value}>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                    {day.label}
                  </h3>
                  <span className="text-sm text-gray-500 dark:text-gray-400">
                    {day.schedules.length} block{day.schedules.length !== 1 ? "s" : ""}
                  </span>
                </div>

                {day.schedules.length === 0 ? (
                  <p className="text-sm text-gray-400 dark:text-gray-500 italic">
                    No schedule set
                  </p>
                ) : (
                  <div className="space-y-2">
                    {day.schedules.map((schedule) => {
                      const typeInfo = getTypeInfo(schedule.schedule_type);
                      return (
                        <div
                          key={schedule.id}
                          className={`rounded-lg border-l-4 bg-gray-50 dark:bg-gray-900 px-3 py-2 ${
                            schedule.is_active ? "" : "opacity-50"
                          }`}
                        >
                          <div className={`border-l-4 ${typeInfo.color} -ml-3 pl-3`}>
                            <div className="flex items-start justify-between">
                              <div>
                                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                  {schedule.name}
                                </p>
                                <p className={`text-xs ${typeInfo.textColor}`}>
                                  {typeInfo.label}
                                </p>
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                                  <Clock className="inline h-3 w-3 mr-1" />
                                  {formatTime(schedule.start_time)} - {formatTime(schedule.end_time)}
                                </p>
                              </div>
                              <div className="flex gap-1">
                                <button
                                  onClick={() => openEdit(schedule)}
                                  className="rounded p-1 text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 hover:text-gray-600 dark:hover:text-gray-300"
                                >
                                  <Edit className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  onClick={() => setDeleteTarget(schedule)}
                                  className="rounded p-1 text-gray-400 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-500"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Card>
            ))}
          </div>
        </>
      )}

      {/* Overrides Tab */}
      {activeTab === "overrides" && (
        <div>
          <p className="mb-4 text-sm text-gray-600 dark:text-gray-400">
            Schedule overrides temporarily replace the regular weekly schedule for special events,
            holidays, or other occasions. Active overrides take priority over the weekly schedule.
          </p>

          {overrides.length === 0 ? (
            <Card>
              <div className="text-center py-8">
                <AlertTriangle className="mx-auto h-12 w-12 text-gray-300 dark:text-gray-600" />
                <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
                  No schedule overrides configured
                </p>
                <Button icon={Plus} onClick={openCreateOverride} className="mt-4">
                  Add Override
                </Button>
              </div>
            </Card>
          ) : (
            <div className="space-y-3">
              {overrides.map((ov) => {
                const typeInfo = getTypeInfo(ov.schedule_type);
                const isActive = ov.is_active && new Date(ov.start_datetime) <= now && new Date(ov.end_datetime) > now;
                const isPast = new Date(ov.end_datetime) < now;
                const isFuture = new Date(ov.start_datetime) > now;

                return (
                  <Card key={ov.id} className={isPast ? "opacity-50" : ""}>
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-3">
                        <div className={`mt-1 h-4 w-4 rounded-full ${typeInfo.color}`} />
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-gray-900 dark:text-gray-100">
                              {ov.name}
                            </p>
                            {isActive && (
                              <span className="rounded-full bg-green-100 dark:bg-green-900/30 px-2 py-0.5 text-xs font-medium text-green-700 dark:text-green-400">
                                Active Now
                              </span>
                            )}
                            {isFuture && (
                              <span className="rounded-full bg-blue-100 dark:bg-blue-900/30 px-2 py-0.5 text-xs font-medium text-blue-700 dark:text-blue-400">
                                Upcoming
                              </span>
                            )}
                            {isPast && (
                              <span className="rounded-full bg-gray-100 dark:bg-gray-700 px-2 py-0.5 text-xs font-medium text-gray-500 dark:text-gray-400">
                                Expired
                              </span>
                            )}
                            {!ov.is_active && (
                              <span className="rounded-full bg-yellow-100 dark:bg-yellow-900/30 px-2 py-0.5 text-xs font-medium text-yellow-700 dark:text-yellow-400">
                                Disabled
                              </span>
                            )}
                          </div>
                          <p className={`text-sm ${typeInfo.textColor}`}>{typeInfo.label}</p>
                          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                            <Clock className="inline h-3.5 w-3.5 mr-1" />
                            {formatDateTime(ov.start_datetime)} — {formatDateTime(ov.end_datetime)}
                          </p>
                          {ov.notes && (
                            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                              {ov.notes}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <button
                          onClick={() => openEditOverride(ov)}
                          className="rounded p-1.5 text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 hover:text-gray-600 dark:hover:text-gray-300"
                        >
                          <Edit className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => setDeleteOverrideTarget(ov)}
                          className="rounded p-1.5 text-gray-400 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-500"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Create/Edit Schedule Modal */}
      <Modal
        open={showModal}
        onClose={() => {
          setShowModal(false);
          resetForm();
        }}
        title={editingSchedule ? "Edit Schedule Block" : "Add Schedule Block"}
        size="md"
      >
        <div className="space-y-4">
          <Input
            label="Name"
            value={formName}
            onChange={(e) => setFormName(e.target.value)}
            placeholder="e.g., Morning Men's Swim"
          />

          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Type
            </label>
            <select
              value={formType}
              onChange={(e) => setFormType(e.target.value)}
              className="block w-full rounded-lg border-0 px-3.5 py-2.5 text-sm shadow-sm ring-1 ring-inset ring-gray-300 dark:ring-gray-600 focus:ring-2 focus:ring-brand-600 dark:bg-gray-800 dark:text-gray-100"
            >
              {SCHEDULE_TYPES.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Day of Week
            </label>
            <select
              value={formDay}
              onChange={(e) => setFormDay(parseInt(e.target.value, 10))}
              className="block w-full rounded-lg border-0 px-3.5 py-2.5 text-sm shadow-sm ring-1 ring-inset ring-gray-300 dark:ring-gray-600 focus:ring-2 focus:ring-brand-600 dark:bg-gray-800 dark:text-gray-100"
            >
              {DAYS.map((day) => (
                <option key={day.value} value={day.value}>
                  {day.label}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Start Time
              </label>
              <input
                type="time"
                value={formStartTime}
                onChange={(e) => setFormStartTime(e.target.value)}
                className="block w-full rounded-lg border-0 px-3.5 py-2.5 text-sm shadow-sm ring-1 ring-inset ring-gray-300 dark:ring-gray-600 focus:ring-2 focus:ring-brand-600 dark:bg-gray-800 dark:text-gray-100"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                End Time
              </label>
              <input
                type="time"
                value={formEndTime}
                onChange={(e) => setFormEndTime(e.target.value)}
                className="block w-full rounded-lg border-0 px-3.5 py-2.5 text-sm shadow-sm ring-1 ring-inset ring-gray-300 dark:ring-gray-600 focus:ring-2 focus:ring-brand-600 dark:bg-gray-800 dark:text-gray-100"
              />
            </div>
          </div>

          <Input
            label="Notes (optional)"
            value={formNotes}
            onChange={(e) => setFormNotes(e.target.value)}
            placeholder="Any additional notes"
          />

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="formActive"
              checked={formActive}
              onChange={(e) => setFormActive(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-600"
            />
            <label htmlFor="formActive" className="text-sm text-gray-700 dark:text-gray-300">
              Active
            </label>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button
              variant="secondary"
              onClick={() => {
                setShowModal(false);
                resetForm();
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleSave} loading={saving}>
              {editingSchedule ? "Update" : "Create"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Create/Edit Override Modal */}
      <Modal
        open={showOverrideModal}
        onClose={() => {
          setShowOverrideModal(false);
          resetOverrideForm();
        }}
        title={editingOverride ? "Edit Schedule Override" : "Add Schedule Override"}
        size="md"
      >
        <div className="space-y-4">
          <Input
            label="Name"
            value={ovName}
            onChange={(e) => setOvName(e.target.value)}
            placeholder="e.g., Holiday Closure, Private Event"
          />

          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Schedule Type
            </label>
            <select
              value={ovType}
              onChange={(e) => setOvType(e.target.value)}
              className="block w-full rounded-lg border-0 px-3.5 py-2.5 text-sm shadow-sm ring-1 ring-inset ring-gray-300 dark:ring-gray-600 focus:ring-2 focus:ring-brand-600 dark:bg-gray-800 dark:text-gray-100"
            >
              {SCHEDULE_TYPES.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Start Date & Time
            </label>
            <input
              type="datetime-local"
              value={ovStartDateTime}
              onChange={(e) => setOvStartDateTime(e.target.value)}
              className="block w-full rounded-lg border-0 px-3.5 py-2.5 text-sm shadow-sm ring-1 ring-inset ring-gray-300 dark:ring-gray-600 focus:ring-2 focus:ring-brand-600 dark:bg-gray-800 dark:text-gray-100"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
              End Date & Time
            </label>
            <input
              type="datetime-local"
              value={ovEndDateTime}
              onChange={(e) => setOvEndDateTime(e.target.value)}
              className="block w-full rounded-lg border-0 px-3.5 py-2.5 text-sm shadow-sm ring-1 ring-inset ring-gray-300 dark:ring-gray-600 focus:ring-2 focus:ring-brand-600 dark:bg-gray-800 dark:text-gray-100"
            />
          </div>

          <Input
            label="Notes (optional)"
            value={ovNotes}
            onChange={(e) => setOvNotes(e.target.value)}
            placeholder="Any additional notes"
          />

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="ovActive"
              checked={ovActive}
              onChange={(e) => setOvActive(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-600"
            />
            <label htmlFor="ovActive" className="text-sm text-gray-700 dark:text-gray-300">
              Active
            </label>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button
              variant="secondary"
              onClick={() => {
                setShowOverrideModal(false);
                resetOverrideForm();
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleSaveOverride} loading={saving}>
              {editingOverride ? "Update" : "Create"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete Schedule Confirmation */}
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete Schedule Block"
        message={`Are you sure you want to delete "${deleteTarget?.name}"?`}
        confirmLabel="Delete"
      />

      {/* Delete Override Confirmation */}
      <ConfirmDialog
        open={!!deleteOverrideTarget}
        onClose={() => setDeleteOverrideTarget(null)}
        onConfirm={handleDeleteOverride}
        title="Delete Schedule Override"
        message={`Are you sure you want to delete "${deleteOverrideTarget?.name}"?`}
        confirmLabel="Delete"
      />

      {/* Clear All Confirmation */}
      <ConfirmDialog
        open={showClearAll}
        onClose={() => setShowClearAll(false)}
        onConfirm={handleClearAll}
        title="Clear All Schedules"
        message="Are you sure you want to delete ALL schedule blocks? This cannot be undone."
        confirmLabel="Clear All"
      />
    </div>
  );
}
