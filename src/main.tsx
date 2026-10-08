import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
// CoreUI (solo botones) primero para que styles.css gane la cascada
import "./coreui-buttons.scss";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);