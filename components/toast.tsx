"use client";

import { useEffect, useState } from "react";

export type ToastType = "success" | "error" | "info" | "warning";

export interface ToastMessage {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  duration?: number;
}

let toastListeners: Array<(toast: ToastMessage) => void> = [];

export const toast = {
  success: (title: string, message?: string, duration = 4000) => {
    const toastMessage: ToastMessage = {
      id: Math.random().toString(36).substring(7),
      type: "success",
      title,
      message,
      duration,
    };
    toastListeners.forEach((listener) => listener(toastMessage));
  },
  error: (title: string, message?: string, duration = 5000) => {
    const toastMessage: ToastMessage = {
      id: Math.random().toString(36).substring(7),
      type: "error",
      title,
      message,
      duration,
    };
    toastListeners.forEach((listener) => listener(toastMessage));
  },
  info: (title: string, message?: string, duration = 4000) => {
    const toastMessage: ToastMessage = {
      id: Math.random().toString(36).substring(7),
      type: "info",
      title,
      message,
      duration,
    };
    toastListeners.forEach((listener) => listener(toastMessage));
  },
  warning: (title: string, message?: string, duration = 4000) => {
    const toastMessage: ToastMessage = {
      id: Math.random().toString(36).substring(7),
      type: "warning",
      title,
      message,
      duration,
    };
    toastListeners.forEach((listener) => listener(toastMessage));
  },
};

export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  useEffect(() => {
    const listener = (toast: ToastMessage) => {
      setToasts((prev) => [...prev, toast]);

      // Auto remove after duration
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== toast.id));
      }, toast.duration || 4000);
    };

    toastListeners.push(listener);

    return () => {
      toastListeners = toastListeners.filter((l) => l !== listener);
    };
  }, []);

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const getIcon = (type: ToastType) => {
    switch (type) {
      case "success":
        return (
          <svg className="h-5 w-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
      case "error":
        return (
          <svg className="h-5 w-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
      case "warning":
        return (
          <svg className="h-5 w-5 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        );
      case "info":
        return (
          <svg className="h-5 w-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
    }
  };

  const getBackgroundColor = (type: ToastType) => {
    switch (type) {
      case "success":
        return "bg-green-50 border-green-200";
      case "error":
        return "bg-red-50 border-red-200";
      case "warning":
        return "bg-yellow-50 border-yellow-200";
      case "info":
        return "bg-blue-50 border-blue-200";
    }
  };

  const getTitleColor = (type: ToastType) => {
    switch (type) {
      case "success":
        return "text-green-900";
      case "error":
        return "text-red-900";
      case "warning":
        return "text-yellow-900";
      case "info":
        return "text-blue-900";
    }
  };

  const getMessageColor = (type: ToastType) => {
    switch (type) {
      case "success":
        return "text-green-700";
      case "error":
        return "text-red-700";
      case "warning":
        return "text-yellow-700";
      case "info":
        return "text-blue-700";
    }
  };

  return (
    <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 max-w-md w-full pointer-events-none">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`pointer-events-auto animate-in slide-in-from-right duration-300 ${getBackgroundColor(
            toast.type
          )} border rounded-lg shadow-lg p-4 flex items-start gap-3`}
        >
          <div className="flex-shrink-0">{getIcon(toast.type)}</div>
          <div className="flex-1 min-w-0">
            <p className={`text-sm font-semibold ${getTitleColor(toast.type)}`}>
              {toast.title}
            </p>
            {toast.message && (
              <p className={`mt-1 text-sm ${getMessageColor(toast.type)}`}>
                {toast.message}
              </p>
            )}
          </div>
          <button
            onClick={() => removeToast(toast.id)}
            className="flex-shrink-0 text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      ))}
    </div>
  );
}
