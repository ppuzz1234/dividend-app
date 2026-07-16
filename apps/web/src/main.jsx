import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles/global.css";
import App from "./App.jsx";
import { DeviceFrame } from "./components/layout/DeviceFrame.jsx";

/* 경로가 /device 면 아이폰 17 Pro 프레임 시뮬레이터로 진입(앱을 iframe 임베드).
   그 외에는 실서비스 앱을 그대로 렌더. */
const isDevice = /\/device\/?$/.test(window.location.pathname);

createRoot(document.getElementById("root")).render(
  <StrictMode>{isDevice ? <DeviceFrame /> : <App />}</StrictMode>
);
