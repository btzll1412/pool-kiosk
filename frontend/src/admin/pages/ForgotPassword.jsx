import { useState } from "react";
import { Link } from "react-router-dom";
import { Waves, ArrowLeft, Mail, User } from "lucide-react";
import toast from "react-hot-toast";
import { forgotPassword, forgotUsername } from "../../api/auth";
import Button from "../../shared/Button";
import Input from "../../shared/Input";

export default function ForgotPassword() {
  const [mode, setMode] = useState("password"); // 'password' or 'username'
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email) {
      toast.error("Please enter your email address");
      return;
    }

    setLoading(true);
    try {
      if (mode === "password") {
        await forgotPassword(email);
      } else {
        await forgotUsername(email);
      }
      setSubmitted(true);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-gray-50 via-white to-brand-50 dark:from-gray-900 dark:via-gray-900 dark:to-gray-900 px-4">
        <div className="w-full max-w-sm text-center">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
            <Mail className="h-8 w-8 text-green-600 dark:text-green-400" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            Check Your Email
          </h1>
          <p className="mt-3 text-sm text-gray-600 dark:text-gray-400">
            {mode === "password"
              ? "If an account with that email exists, we've sent a password reset link."
              : "If an account with that email exists, we've sent your username."}
          </p>
          <p className="mt-4 text-xs text-gray-500 dark:text-gray-500">
            Didn't receive it? Check your spam folder or{" "}
            <button
              onClick={() => {
                setSubmitted(false);
                setEmail("");
              }}
              className="text-brand-600 hover:text-brand-700 dark:text-brand-400 font-medium"
            >
              try again
            </button>
          </p>
          <Link
            to="/admin/login"
            className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-gray-50 via-white to-brand-50 dark:from-gray-900 dark:via-gray-900 dark:to-gray-900 px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-600 shadow-lg shadow-brand-200">
            <Waves className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-gray-100">
            {mode === "password" ? "Reset Password" : "Forgot Username"}
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {mode === "password"
              ? "Enter your email to receive a reset link"
              : "Enter your email to receive your username"}
          </p>
        </div>

        {/* Mode Toggle */}
        <div className="mb-6 flex rounded-lg bg-gray-100 dark:bg-gray-800 p-1">
          <button
            type="button"
            onClick={() => setMode("password")}
            className={`flex-1 flex items-center justify-center gap-2 rounded-md py-2 text-sm font-medium transition-all ${
              mode === "password"
                ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm"
                : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200"
            }`}
          >
            <Mail className="h-4 w-4" />
            Password
          </button>
          <button
            type="button"
            onClick={() => setMode("username")}
            className={`flex-1 flex items-center justify-center gap-2 rounded-md py-2 text-sm font-medium transition-all ${
              mode === "username"
                ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm"
                : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200"
            }`}
          >
            <User className="h-4 w-4" />
            Username
          </button>
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-8 shadow-xl shadow-gray-100/50 dark:shadow-gray-900/50">
          <form onSubmit={handleSubmit} className="space-y-5">
            <Input
              label="Email Address"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your email"
              autoFocus
              required
            />

            <Button
              type="submit"
              loading={loading}
              className="w-full"
              size="lg"
            >
              {mode === "password" ? "Send Reset Link" : "Send Username"}
            </Button>
          </form>
        </div>

        <div className="mt-6 text-center">
          <Link
            to="/admin/login"
            className="inline-flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to login
          </Link>
        </div>
      </div>
    </div>
  );
}
