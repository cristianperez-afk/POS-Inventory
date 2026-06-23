
  import { createRoot } from "react-dom/client";
  import App from "./App.tsx";
  import { installAuthFetchInterceptor } from "./shared/api/fetchWithAuth";
  import "./styles/index.css";

  installAuthFetchInterceptor();
  createRoot(document.getElementById("root")!).render(<App />);
  
