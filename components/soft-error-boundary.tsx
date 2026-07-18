"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import { recordClientError } from "@/lib/observability";

type SoftErrorBoundaryProps = {
  children: ReactNode;
  /** Optional fallback UI; defaults to a compact retry strip. */
  fallback?: ReactNode;
  label?: string;
};

type SoftErrorBoundaryState = {
  hasError: boolean;
};

/**
 * Lightweight client ErrorBoundary for checkout / editor / gallery islands.
 * Keeps surrounding chrome mounted when a leaf island throws.
 */
export class SoftErrorBoundary extends Component<SoftErrorBoundaryProps, SoftErrorBoundaryState> {
  state: SoftErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): SoftErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, _info: ErrorInfo) {
    recordClientError({
      name: error.name,
      message: error.message,
      stack: error.stack,
      digest: this.props.label ? `boundary:${this.props.label}` : undefined
    });
  }

  private retry = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    if (this.props.fallback) return this.props.fallback;

    return (
      <div
        data-soft-error-boundary
        role="alert"
        className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700"
      >
        <p>{this.props.label ? `${this.props.label} failed to render.` : "This section failed to render."}</p>
        <button
          type="button"
          onClick={this.retry}
          className="mt-2 text-sm font-medium text-slate-900 underline underline-offset-2"
        >
          Retry
        </button>
      </div>
    );
  }
}
