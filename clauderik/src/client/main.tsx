import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router";
import ChatView from "./ChatView"

import App from "./App";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route element={<App />}>
          <Route path="/new" element={<ChatView />} />
          <Route path="/chat/:chatId" element={<ChatView />} />
          <Route path="/chat" element={<Navigate to="/new" replace />} />
          <Route path="/" element={<Navigate to="/new" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
);
