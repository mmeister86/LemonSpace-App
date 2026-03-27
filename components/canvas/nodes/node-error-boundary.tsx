"use client";

import * as Sentry from "@sentry/nextjs";
import type { ErrorInfo, ReactNode } from "react";
import { Component } from "react";

interface NodeErrorBoundaryProps {
  children: ReactNode;
  nodeType: string;
}

interface NodeErrorBoundaryState {
  hasError: boolean;
  errorMessage?: string;
}

export class NodeErrorBoundary extends Component<
  NodeErrorBoundaryProps,
  NodeErrorBoundaryState
> {
  state: NodeErrorBoundaryState = {
    hasError: false,
  };

  static getDerivedStateFromError(error: Error): NodeErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error.message,
    };
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    Sentry.captureException(error, {
      tags: { nodeType: this.props.nodeType },
      extra: { componentStack: errorInfo.componentStack },
    });

    console.error("Node rendering error", {
      nodeType: this.props.nodeType,
      error,
      componentStack: errorInfo.componentStack,
    });
  }

  private handleRetry = () => {
    this.setState({ hasError: false, errorMessage: undefined });
  };

  override render() {
    if (this.state.hasError) {
      return (
        <div className="m-2 rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs">
          <p className="font-medium text-destructive">Node render failed ({this.props.nodeType})</p>
          {this.state.errorMessage && (
            <p className="mt-1 truncate text-destructive/90" title={this.state.errorMessage}>
              {this.state.errorMessage}
            </p>
          )}
          <button
            type="button"
            onClick={this.handleRetry}
            className="nodrag mt-2 rounded border border-destructive/30 px-2 py-1 text-[11px] font-medium text-destructive transition-colors hover:bg-destructive/10"
          >
            Retry
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
