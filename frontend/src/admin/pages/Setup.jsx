import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Waves, CheckCircle2 } from "lucide-react";
import toast from "react-hot-toast";
import { setupAdmin } from "../../api/auth";
import { useAuth } from "../../context/AuthContext";
import Button from "../../shared/Button";
import Input from "../../shared/Input";

export default function Setup() {
  const navigate = useNavigate();
  const { setAuthedFromSetup } = useAuth();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});

  const validateForm = () => {
    const newErrors = {};

    if (username.length < 3) {
      newErrors.username = "Username must be at least 3 characters";
    }

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      newErrors.email = "Please enter a valid email address";
    }

    if (password.length < 8) {
      newErrors.password = "Password must be at least 8 characters";
    }

    if (password !== confirmPassword) {
      newErrors.confirmPassword = "Passwords do not match";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!validateForm()) return;

    setLoading(true);
    try {
      await setupAdmin({ username, email, password });
      setAuthedFromSetup();
      toast.success("Admin account created successfully!");
      navigate("/admin");
    } catch (err) {
      const detail = err.response?.data?.detail;
      if (typeof detail === "string") {
        toast.error(detail);
      } else if (Array.isArray(detail)) {
        // Pydantic validation errors
        const fieldErrors = {};
        detail.forEach((error) => {
          const field = error.loc?.[1];
          if (field) fieldErrors[field] = error.msg;
        });
        setErrors(fieldErrors);
        toast.error("Please fix the errors below");
      } else {
        toast.error("Setup failed. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  const passwordRequirements = [
    { met: password.length >= 8, text: "At least 8 characters" },
  ];

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-gray-50 via-white to-brand-50 dark:from-gray-900 dark:via-gray-900 dark:to-gray-900 px-4 py-8">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-600 shadow-lg shadow-brand-200">
            <Waves className="h-10 w-10 text-white" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-gray-100">
            Welcome to Pool Manager
          </h1>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            Let's set up your admin account to get started
          </p>
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-8 shadow-xl shadow-gray-100/50 dark:shadow-gray-900/50">
          <form onSubmit={handleSubmit} className="space-y-5">
            <Input
              label="Username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Choose a username"
              error={errors.username}
              autoFocus
              required
            />

            <Input
              label="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              error={errors.email}
              helpText="Used for password recovery"
              required
            />

            <Input
              label="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Create a password"
              error={errors.password}
              required
            />

            {/* Password requirements */}
            <div className="space-y-1.5">
              {passwordRequirements.map((req, i) => (
                <div
                  key={i}
                  className={`flex items-center gap-2 text-xs ${
                    req.met
                      ? "text-green-600 dark:text-green-400"
                      : "text-gray-400 dark:text-gray-500"
                  }`}
                >
                  <CheckCircle2
                    className={`h-3.5 w-3.5 ${
                      req.met ? "opacity-100" : "opacity-40"
                    }`}
                  />
                  {req.text}
                </div>
              ))}
            </div>

            <Input
              label="Confirm Password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm your password"
              error={errors.confirmPassword}
              required
            />

            <Button
              type="submit"
              loading={loading}
              className="w-full"
              size="lg"
            >
              Create Admin Account
            </Button>
          </form>
        </div>

        <p className="mt-6 text-center text-xs text-gray-400 dark:text-gray-500">
          This will be the primary administrator account
        </p>
      </div>
    </div>
  );
}
