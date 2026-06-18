
import { useEffect } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster, toast } from "sonner";
import App from "./app/App.tsx";
import { SessionProvider } from "./app/hooks/useSession";
import { appQueryClient } from "./app/queryClient";
import "./styles/index.css";

function ApiErrorListener() {
  useEffect(() => {
    const handleApiError = (event: Event) => {
      const detail = (event as CustomEvent<{ message?: string }>).detail;
      toast.error(detail?.message || "A request failed");
    };
    window.addEventListener("api-error", handleApiError);
    return () => window.removeEventListener("api-error", handleApiError);
  }, []);

  return null;
}

createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={appQueryClient}>
    <SessionProvider>
    <BrowserRouter>
        <App />
        <ApiErrorListener />
    </BrowserRouter>
    </SessionProvider>
    <Toaster richColors position="top-right" />
  </QueryClientProvider>
);
