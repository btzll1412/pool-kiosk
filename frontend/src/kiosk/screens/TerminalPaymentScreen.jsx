import { useEffect, useState, useRef, useCallback } from "react";
import { ArrowLeft, CreditCard, Loader2, CheckCircle, XCircle, Smartphone } from "lucide-react";
import toast from "react-hot-toast";
import KioskButton from "../components/KioskButton";
import {
  initiateTerminalPayment,
  checkTerminalPaymentStatus,
  cancelTerminalPayment,
} from "../../api/kiosk";

const POLL_INTERVAL_MS = 1500;
const MAX_POLL_ATTEMPTS = 80; // ~2 minutes

export default function TerminalPaymentScreen({ member, goTo, context, settings }) {
  const plan = context.plan;
  const pin = context.pin;
  const useCredit = context.useCredit || false;
  const creditAmount = Number(context.creditAmount || 0);
  const fullPrice = Number(plan?.price || 0);
  const proratedPrice = plan?.prorated ? Number(plan.prorated.prorated_price) : fullPrice;
  const originalPrice = proratedPrice;
  const price = useCredit ? Number(context.adjustedPrice || originalPrice) : originalPrice;

  const [status, setStatus] = useState("initiating"); // initiating, waiting, processing, success, failed, cancelled
  const [requestKey, setRequestKey] = useState(null);
  const [error, setError] = useState(null);
  const [cardInfo, setCardInfo] = useState(null);
  const pollCountRef = useRef(0);
  const pollIntervalRef = useRef(null);
  const requestKeyRef = useRef(null);

  const cleanup = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  }, []);

  const pollStatus = useCallback(async () => {
    if (!requestKeyRef.current) return;

    pollCountRef.current++;
    if (pollCountRef.current > MAX_POLL_ATTEMPTS) {
      cleanup();
      setStatus("failed");
      setError("Terminal payment timed out. Please try again.");
      return;
    }

    try {
      const result = await checkTerminalPaymentStatus(requestKeyRef.current);

      if (result.complete) {
        cleanup();
        if (result.approved) {
          setStatus("success");
          setCardInfo({
            last4: result.card_last4,
            brand: result.card_brand,
          });
        } else {
          setStatus("failed");
          setError(result.error || "Payment was declined");
        }
      } else if (result.status === "error") {
        cleanup();
        setStatus("failed");
        setError(result.error || "Terminal error occurred");
      }
      // Otherwise keep polling
    } catch (err) {
      // Network error - keep trying
      console.error("Poll error:", err);
    }
  }, [cleanup]);

  const initiatePayment = useCallback(async () => {
    setStatus("initiating");
    setError(null);

    try {
      const result = await initiateTerminalPayment(
        member.member_id,
        plan.id,
        pin,
        false, // save_card
        useCredit
      );

      if (result.error) {
        setStatus("failed");
        setError(result.error);
        return;
      }

      setRequestKey(result.request_key);
      requestKeyRef.current = result.request_key;
      setStatus("waiting");

      // Start polling
      pollCountRef.current = 0;
      pollIntervalRef.current = setInterval(pollStatus, POLL_INTERVAL_MS);
    } catch (err) {
      setStatus("failed");
      setError(err.response?.data?.detail || "Failed to initiate terminal payment");
    }
  }, [member.member_id, plan.id, pin, useCredit, pollStatus]);

  useEffect(() => {
    initiatePayment();
    return cleanup;
  }, []);

  const handleCancel = async () => {
    cleanup();
    if (requestKeyRef.current) {
      try {
        await cancelTerminalPayment(requestKeyRef.current);
      } catch {
        // Ignore cancel errors
      }
    }
    setStatus("cancelled");
    goTo("payment");
  };

  const handleRetry = () => {
    initiatePayment();
  };

  const handleDone = () => {
    goTo("status", {
      statusType: "success",
      statusTitle: "Payment Complete!",
      statusMessage: `Card payment of ${settings.currency}${price.toFixed(2)} processed successfully.`,
    });
  };

  if (!plan) {
    goTo("payment");
    return null;
  }

  return (
    <div className="flex h-full flex-col bg-gray-50">
      <div className="flex items-center justify-between border-b border-gray-100 bg-white px-6 py-4">
        <button
          type="button"
          onClick={handleCancel}
          disabled={status === "success"}
          className="flex items-center gap-2 rounded-xl px-4 py-2 text-gray-500 transition-all hover:bg-gray-100 active:bg-gray-200 disabled:opacity-50"
        >
          <ArrowLeft className="h-5 w-5" />
          <span className="font-medium">Cancel</span>
        </button>
        <h1 className="text-lg font-bold text-gray-900">Terminal Payment</h1>
        <div className="w-24" />
      </div>

      <div className="flex flex-1 flex-col items-center justify-center px-6 py-8">
        <div className="w-full max-w-md text-center">
          {/* Amount display */}
          <div className="mb-8 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
            <p className="text-sm text-gray-500">{plan.name}</p>
            <p className="mt-2 text-4xl font-extrabold text-gray-900">
              {settings.currency}{price.toFixed(2)}
            </p>
          </div>

          {/* Status display */}
          {(status === "initiating" || status === "waiting") && (
            <div className="space-y-6">
              <div className="relative mx-auto h-32 w-32">
                <div className="absolute inset-0 flex items-center justify-center">
                  <Smartphone className="h-20 w-20 text-brand-600" />
                </div>
                <div className="absolute inset-0 animate-ping">
                  <div className="h-full w-full rounded-full border-4 border-brand-300 opacity-30" />
                </div>
              </div>

              <div>
                <h2 className="text-2xl font-bold text-gray-900">
                  {status === "initiating" ? "Connecting to Terminal..." : "Tap or Insert Card"}
                </h2>
                <p className="mt-2 text-gray-500">
                  {status === "initiating"
                    ? "Please wait while we connect to the payment terminal"
                    : "Please tap, insert, or swipe your card on the terminal"}
                </p>
              </div>

              {status === "waiting" && (
                <div className="flex items-center justify-center gap-2 text-brand-600">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span className="text-sm font-medium">Waiting for card...</span>
                </div>
              )}

              <KioskButton
                variant="ghost"
                size="lg"
                onClick={handleCancel}
                className="mt-4 w-full"
              >
                Cancel Payment
              </KioskButton>
            </div>
          )}

          {status === "processing" && (
            <div className="space-y-6">
              <Loader2 className="mx-auto h-20 w-20 animate-spin text-brand-600" />
              <div>
                <h2 className="text-2xl font-bold text-gray-900">Processing Payment</h2>
                <p className="mt-2 text-gray-500">Please wait while we process your payment</p>
              </div>
            </div>
          )}

          {status === "success" && (
            <div className="space-y-6">
              <CheckCircle className="mx-auto h-24 w-24 text-emerald-500" />
              <div>
                <h2 className="text-2xl font-bold text-gray-900">Payment Successful!</h2>
                {cardInfo?.last4 && (
                  <p className="mt-2 text-gray-500">
                    Paid with {cardInfo.brand || "card"} ending in {cardInfo.last4}
                  </p>
                )}
              </div>

              <KioskButton
                variant="primary"
                size="xl"
                icon={CheckCircle}
                onClick={handleDone}
                className="mt-6 w-full"
              >
                Done
              </KioskButton>
            </div>
          )}

          {status === "failed" && (
            <div className="space-y-6">
              <XCircle className="mx-auto h-24 w-24 text-red-500" />
              <div>
                <h2 className="text-2xl font-bold text-gray-900">Payment Failed</h2>
                <p className="mt-2 text-red-600">{error || "An error occurred"}</p>
              </div>

              <div className="flex flex-col gap-3">
                <KioskButton
                  variant="primary"
                  size="xl"
                  icon={CreditCard}
                  onClick={handleRetry}
                  className="w-full"
                >
                  Try Again
                </KioskButton>

                <KioskButton
                  variant="ghost"
                  size="lg"
                  onClick={() => goTo("payment")}
                  className="w-full"
                >
                  Choose Different Payment
                </KioskButton>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
