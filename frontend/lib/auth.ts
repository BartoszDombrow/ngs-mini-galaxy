"use client";

const TOKEN_KEY = "ngs-mini-galaxy-token";
const TOKEN_EVENT = "ngs-mini-galaxy-token-change";

export function getToken() {
  if (typeof window === "undefined") {
    return null;
  }
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string) {
  window.localStorage.setItem(TOKEN_KEY, token);
  window.dispatchEvent(new Event(TOKEN_EVENT));
}

export function clearToken() {
  window.localStorage.removeItem(TOKEN_KEY);
  window.dispatchEvent(new Event(TOKEN_EVENT));
}

export function subscribeToToken(callback: () => void) {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  const onChange = () => callback();
  window.addEventListener(TOKEN_EVENT, onChange);
  window.addEventListener("storage", onChange);

  return () => {
    window.removeEventListener(TOKEN_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}
