// apps/admin/src/components/ErrorBoundary.tsx
import React from "react";

type State = { hasError: boolean; error?: any };

export default class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  componentDidCatch(error: any, info: any) {
    // İsterseniz Sentry vb. bağlayın
    console.error("[ErrorBoundary]", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ maxWidth: 960, margin: "4rem auto", padding: 16, border: "1px solid #f0dada", borderRadius: 12, background: "#fff" }}>
          <h2 style={{ marginTop: 0 }}>Bir şeyler ters gitti</h2>
          <p style={{ color: "#6b7280" }}>
            Sayfa çizimde hata aldı. Lütfen sayfayı yenileyin. Sorun devam ederse konsol/Network hatasını bize iletin.
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}
