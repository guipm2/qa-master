"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Send, ArrowLeft, ChevronDown, ChevronUp, Loader2, Copy, Check } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import clsx from "clsx";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

type AuthType = "none" | "bearer" | "api_key" | "basic";
type HttpMethod = "POST" | "GET" | "PUT" | "PATCH" | "DELETE";

interface WebhookResponse {
  status_code: number;
  headers: Record<string, string>;
  body: unknown;
  elapsed_ms: number;
}

interface WebhookRequestBody {
  url: string;
  method: HttpMethod;
  auth: {
    type: AuthType;
    value?: string;
    header_name?: string;
  };
  payload?: unknown;
  headers?: Record<string, string>;
}

const METHOD_COLORS: Record<HttpMethod, string> = {
  POST: "bg-green-600",
  GET: "bg-blue-600",
  PUT: "bg-yellow-600",
  PATCH: "bg-orange-600",
  DELETE: "bg-red-600",
};

export default function WebhookPage() {
  // Form state
  const [url, setUrl] = useState("");
  const [method, setMethod] = useState<HttpMethod>("POST");
  const [authType, setAuthType] = useState<AuthType>("none");
  const [authValue, setAuthValue] = useState("");
  const [authHeaderName, setAuthHeaderName] = useState("X-API-Key");
  const [payload, setPayload] = useState(JSON.stringify({ message: "Hello from QA Master" }, null, 2));
  const [customHeaders, setCustomHeaders] = useState("");

  // Response state
  const [response, setResponse] = useState<WebhookResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [showResponseHeaders, setShowResponseHeaders] = useState(false);
  const [copied, setCopied] = useState(false);

  const validatePayload = (): boolean => {
    if (!payload.trim()) return true;
    try {
      JSON.parse(payload);
      return true;
    } catch {
      return false;
    }
  };

  const formatPayload = () => {
    if (!payload.trim()) return;
    try {
      const parsed = JSON.parse(payload);
      setPayload(JSON.stringify(parsed, null, 2));
    } catch {
      // se nao e JSON valido, tenta limpar e parsear de novo
      // remove quebras de linha e espacos extras pra tentar salvar
      const cleaned = payload.replace(/\s+/g, " ").trim();
      try {
        const parsed = JSON.parse(cleaned);
        setPayload(JSON.stringify(parsed, null, 2));
      } catch {
        setError("Nao foi possivel formatar: JSON invalido.");
      }
    }
  };

  const handleSend = async () => {
    if (!url) return;
    if (!validatePayload()) {
      setError("JSON payload inválido. Verifique a sintaxe.");
      return;
    }

    setIsSending(true);
    setResponse(null);
    setError(null);

    const body: WebhookRequestBody = {
      url,
      method,
      auth: {
        type: authType,
        value: authValue || undefined,
        header_name: authType === "api_key" ? authHeaderName : undefined,
      },
      payload: payload.trim() ? JSON.parse(payload) : undefined,
    };

    // Parse custom headers
    if (customHeaders.trim()) {
      try {
        body.headers = JSON.parse(customHeaders);
      } catch {
        setError("Custom headers devem ser um JSON válido. Ex: {\"X-Custom\": \"value\"}");
        setIsSending(false);
        return;
      }
    }

    try {
      const res = await fetch(`${API_BASE_URL}/api/webhook/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
        setError(errData.detail || `Erro ${res.status}`);
      } else {
        const data: WebhookResponse = await res.json();
        setResponse(data);
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Erro desconhecido";
      setError(`Erro de conexão: ${message}`);
    } finally {
      setIsSending(false);
    }
  };

  const copyResponse = () => {
    if (!response) return;
    navigator.clipboard.writeText(JSON.stringify(response.body, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getStatusColor = (code: number) => {
    if (code >= 200 && code < 300) return "text-green-400";
    if (code >= 300 && code < 400) return "text-yellow-400";
    if (code >= 400 && code < 500) return "text-orange-400";
    return "text-red-400";
  };

  return (
    <main className="min-h-screen bg-black text-white p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <header className="mb-8 flex items-center gap-4">
          <Link href="/" className="p-2 hover:bg-gray-800 rounded-lg transition-colors">
            <ArrowLeft className="w-5 h-5 text-gray-400" />
          </Link>
          <div>
            <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-green-400 to-blue-500">
              Webhook Dispatcher
            </h1>
            <p className="text-gray-500 text-sm">Envie payloads para qualquer webhook</p>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* LEFT: Request Config */}
          <div className="space-y-4">
            {/* URL + Method */}
            <div className="glass-card p-4">
              <label className="block text-sm text-gray-400 mb-2">Endpoint</label>
              <div className="flex gap-2">
                <select
                  value={method}
                  onChange={(e) => setMethod(e.target.value as HttpMethod)}
                  className={clsx(
                    "px-3 py-2 rounded-lg text-white text-sm font-bold border-0 cursor-pointer",
                    METHOD_COLORS[method]
                  )}
                >
                  <option value="POST">POST</option>
                  <option value="GET">GET</option>
                  <option value="PUT">PUT</option>
                  <option value="PATCH">PATCH</option>
                  <option value="DELETE">DELETE</option>
                </select>
                <input
                  type="text"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://webhook.example.com/endpoint"
                  className="flex-1 bg-black border border-gray-700 rounded-lg px-4 py-2 text-sm focus:border-green-500 focus:outline-none"
                />
              </div>
            </div>

            {/* Auth */}
            <div className="glass-card p-4">
              <label className="block text-sm text-gray-400 mb-2">Autenticação</label>
              <select
                value={authType}
                onChange={(e) => setAuthType(e.target.value as AuthType)}
                className="w-full bg-black border border-gray-700 rounded-lg px-4 py-2 text-sm mb-3 focus:border-green-500 focus:outline-none"
              >
                <option value="none">Nenhuma</option>
                <option value="bearer">Bearer Token</option>
                <option value="api_key">API Key (Header)</option>
                <option value="basic">Basic Auth (user:password)</option>
              </select>

              <AnimatePresence>
                {authType !== "none" && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="space-y-2"
                  >
                    {authType === "api_key" && (
                      <input
                        type="text"
                        value={authHeaderName}
                        onChange={(e) => setAuthHeaderName(e.target.value)}
                        placeholder="Nome do header (ex: X-API-Key)"
                        className="w-full bg-black border border-gray-700 rounded-lg px-4 py-2 text-sm focus:border-green-500 focus:outline-none"
                      />
                    )}
                    <input
                      type="password"
                      value={authValue}
                      onChange={(e) => setAuthValue(e.target.value)}
                      placeholder={
                        authType === "bearer"
                          ? "Token..."
                          : authType === "api_key"
                          ? "Valor da API Key..."
                          : "usuario:senha"
                      }
                      className="w-full bg-black border border-gray-700 rounded-lg px-4 py-2 text-sm focus:border-green-500 focus:outline-none"
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Payload */}
            <div className="glass-card p-4">
              <div className="flex justify-between items-center mb-2">
                <label className="text-sm text-gray-400">Payload (JSON)</label>
                <div className="flex items-center gap-2">
                  <button
                    onClick={formatPayload}
                    disabled={!payload.trim()}
                    className="text-[11px] px-2.5 py-1 rounded bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed font-medium"
                    title="Formatar JSON (identacao e quebras de linha)"
                  >
                    Formatar
                  </button>
                  <span
                    className={clsx(
                      "text-xs px-2 py-0.5 rounded",
                      validatePayload()
                        ? "bg-green-900/50 text-green-400"
                        : "bg-red-900/50 text-red-400"
                    )}
                  >
                    {validatePayload() ? "JSON Valido" : "JSON Invalido"}
                  </span>
                </div>
              </div>
              <textarea
                value={payload}
                onChange={(e) => setPayload(e.target.value)}
                onPaste={() => {
                  // auto-format on paste after a tick so the state updates first
                  setTimeout(() => {
                    setPayload(prev => {
                      try { return JSON.stringify(JSON.parse(prev), null, 2); }
                      catch { return prev; }
                    });
                  }, 50);
                }}
                placeholder='{"key": "value"}'
                spellCheck={false}
                className="w-full h-64 bg-black border border-gray-700 rounded-lg p-4 text-sm font-mono focus:border-green-500 focus:outline-none resize-none"
              />
            </div>

            {/* Custom Headers (collapsible) */}
            <div className="glass-card p-4">
              <label className="block text-sm text-gray-400 mb-2">Headers Customizados (opcional)</label>
              <textarea
                value={customHeaders}
                onChange={(e) => setCustomHeaders(e.target.value)}
                placeholder='{"X-Custom-Header": "value"}'
                spellCheck={false}
                className="w-full h-20 bg-black border border-gray-700 rounded-lg p-3 text-sm font-mono focus:border-green-500 focus:outline-none resize-none"
              />
            </div>

            {/* Send Button */}
            <button
              onClick={handleSend}
              disabled={isSending || !url}
              className={clsx(
                "w-full py-3 rounded-xl font-bold text-lg flex items-center justify-center gap-3 transition-all",
                isSending || !url
                  ? "bg-gray-800 text-gray-500 cursor-not-allowed"
                  : "bg-gradient-to-r from-green-600 to-blue-600 hover:from-green-500 hover:to-blue-500 text-white hover:scale-[1.02]"
              )}
            >
              {isSending ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Enviando...
                </>
              ) : (
                <>
                  <Send className="w-5 h-5" />
                  Enviar Request
                </>
              )}
            </button>
          </div>

          {/* RIGHT: Response */}
          <div className="space-y-4">
            <div className="glass-card p-0 min-h-[600px] flex flex-col">
              <div className="p-4 border-b border-gray-800 flex items-center justify-between">
                <h3 className="text-sm font-bold text-gray-300">Resposta</h3>
                {response && (
                  <div className="flex items-center gap-4">
                    <span className="text-xs text-gray-500">
                      {response.elapsed_ms.toFixed(0)}ms
                    </span>
                    <span
                      className={clsx(
                        "text-sm font-bold px-2 py-0.5 rounded",
                        getStatusColor(response.status_code)
                      )}
                    >
                      {response.status_code}
                    </span>
                    <button
                      onClick={copyResponse}
                      className="p-1 hover:bg-gray-800 rounded transition-colors"
                      title="Copiar resposta"
                    >
                      {copied ? (
                        <Check className="w-4 h-4 text-green-400" />
                      ) : (
                        <Copy className="w-4 h-4 text-gray-400" />
                      )}
                    </button>
                  </div>
                )}
              </div>

              <div className="flex-1 p-4 overflow-auto">
                {!response && !error && (
                  <div className="h-full flex items-center justify-center text-gray-600 text-sm">
                    Envie um request para ver a resposta aqui
                  </div>
                )}

                {error && (
                  <div className="p-4 bg-red-900/20 border border-red-800 rounded-lg text-red-400 text-sm">
                    {error}
                  </div>
                )}

                {response && (
                  <div className="space-y-4">
                    {/* Status Summary */}
                    <div className="flex items-center gap-4 p-3 bg-gray-800/50 rounded-lg">
                      <div className={clsx("text-2xl font-bold", getStatusColor(response.status_code))}>
                        {response.status_code}
                      </div>
                      <div className="text-xs text-gray-400">
                        <div>Tempo: {response.elapsed_ms.toFixed(0)}ms</div>
                        <div>Content-Type: {response.headers["content-type"] || "N/A"}</div>
                      </div>
                    </div>

                    {/* Response Headers (collapsible) */}
                    <div>
                      <button
                        onClick={() => setShowResponseHeaders(!showResponseHeaders)}
                        className="flex items-center gap-2 text-xs text-gray-500 hover:text-gray-300 transition-colors"
                      >
                        {showResponseHeaders ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                        Response Headers ({Object.keys(response.headers).length})
                      </button>
                      {showResponseHeaders && (
                        <div className="mt-2 p-3 bg-gray-900 rounded-lg text-xs font-mono space-y-1 max-h-40 overflow-y-auto">
                          {Object.entries(response.headers).map(([key, val]) => (
                            <div key={key}>
                              <span className="text-blue-400">{key}:</span>{" "}
                              <span className="text-gray-300">{val}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Response Body */}
                    <div>
                      <div className="text-xs text-gray-500 mb-2">Response Body</div>
                      <pre className="bg-gray-900 border border-gray-800 rounded-lg p-4 text-sm font-mono text-gray-200 overflow-auto max-h-[400px] whitespace-pre-wrap">
                        {typeof response.body === "object"
                          ? JSON.stringify(response.body, null, 2)
                          : String(response.body)}
                      </pre>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
