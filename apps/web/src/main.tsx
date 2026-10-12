import { IconContext } from "@phosphor-icons/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { App } from "./App";
import { ApiError } from "./lib/api";
import "./styles/index.css";
import { ToastProvider } from "./ui";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Não insiste em erros de permissão/validação; tenta de novo em falhas de rede.
      retry: (count, err) => count < 2 && (!(err instanceof ApiError) || err.isNetwork || err.status >= 500),
      refetchOnWindowFocus: false,
    },
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {/* Ícones arredondados com preenchimento suave em todo o sistema. */}
    <IconContext.Provider value={{ weight: "duotone" }}>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <ToastProvider>
            <App />
          </ToastProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </IconContext.Provider>
  </StrictMode>,
);
