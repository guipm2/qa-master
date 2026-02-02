"use client";

import React, { useState, useRef, useEffect } from "react";
import { Play, RefreshCw, XCircle, ChevronDown, ChevronUp, CheckCircle, AlertTriangle } from "lucide-react";
import clsx from "clsx";
import { motion, AnimatePresence } from "framer-motion";

// --- Types matching Backend (Updated) ---

interface ChatMessage {
  role: "user" | "assistant" | "system" | "evaluator" | "subject";
  content: string;
}

interface Scores {
  compliance: number;
  eficacia: number;
  eficiencia: number;
  qualidade_comunicacao: number;
  experiencia_usuario: number;
  score_geral: number;
}

interface AnalysisCategory {
  score: number;
  comentario: string;
  // Generic mapping for specific fields to avoid huge interfaces, 
  // or we can just display the 'comentario' and lists if they exist.
  [key: string]: any;
}

interface FullAnalysis {
  compliance: AnalysisCategory;
  eficacia: AnalysisCategory;
  eficiencia: AnalysisCategory;
  qualidade_comunicacao: AnalysisCategory;
  experiencia_usuario: AnalysisCategory;
}

interface Summary {
  resultado: "APROVADO" | "REPROVADO" | "ATENÇÃO";
  pontos_fortes: string[];
  pontos_fracos: string[];
  recomendacoes: string[];
}

interface FinalStatus {
  aprovado: boolean;
  criterio_reprovacao?: string;
  pronto_para_producao: boolean;
}

interface EvaluationResult {
  test_id?: string;
  test_scenario?: string;
  scores: Scores;
  analise: FullAnalysis;
  resumo: Summary;
  status_final: FinalStatus;
}

export default function Home() {
  // Config State
  const [apiKey, setApiKey] = useState("");
  const [subjectPrompt, setSubjectPrompt] = useState("Você é um assistente de IA. Seja útil.");
  const [evaluatorPrompt, setEvaluatorPrompt] = useState("Você é um Testador QA. Teste se o agente é educado.");
  const [maxTurns, setMaxTurns] = useState(5);

  // Runtime State
  const [isRunning, setIsRunning] = useState(false);
  const [status, setStatus] = useState("Pronto");
  const [transcript, setTranscript] = useState<ChatMessage[]>([]);
  const [result, setResult] = useState<EvaluationResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [transcript]);

  const handleRunTest = async () => {
    if (!apiKey) {
      alert("Por favor insira uma Chave de API da OpenAI");
      return;
    }

    setIsRunning(true);
    setTranscript([]);
    setResult(null);
    setError(null);
    setStatus("Inicializando...");

    let hasError = false;

    try {
      const response = await fetch("http://127.0.0.1:8000/api/run-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject_instruction: subjectPrompt,
          evaluator_instruction: evaluatorPrompt,
          openai_api_key: apiKey,
          max_turns: maxTurns,
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({ detail: response.statusText }));
        throw new Error(errData.detail || `Erro na API: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("Sem corpo de resposta");

      const decoder = new TextDecoder();
      let buffer = "";

      setStatus("Rodando...");

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const jsonStr = line.substring(6);
            if (!jsonStr) continue;
            try {
              const event = JSON.parse(jsonStr);
              handleEvent(event);
              if (event.type === 'error') hasError = true;
            } catch (e) {
              console.error("Erro ao parsear evento", e);
            }
          }
        }
      }
    } catch (e: any) {
      console.error(e);
      setError(e.message || "Erro desconhecido");
      setStatus("Erro");
      hasError = true;
    } finally {
      setIsRunning(false);
      if (!hasError) setStatus("Concluído");
    }
  };

  const handleEvent = (event: any) => {
    switch (event.type) {
      case "status":
        setStatus(event.content);
        break;
      case "message":
        setTranscript((prev) => [...prev, { role: event.role, content: event.content }]);
        break;
      case "result":
        setResult(event.content);
        break;
      case "error":
        setError(event.content);
        setStatus("Erro");
        break;
    }
  };

  return (
    <main className="min-h-screen bg-black text-white p-8 flex flex-col items-center">
      <header className="w-full max-w-6xl mb-8 flex justify-between items-center">
        <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-600">
          QA Master
        </h1>
        <div className="flex gap-4 items-center">
          <span className={clsx("text-sm px-3 py-1 rounded-full border",
            status.includes("Rodando") ? "border-yellow-500 text-yellow-500" :
              status === "Erro" ? "border-red-500 text-red-500" : "border-green-500 text-green-500")}>
            {status}
          </span>
        </div>
      </header>

      <div className="w-full max-w-6xl grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Configuração */}
        <div className="lg:col-span-1 space-y-6">
          <div className="glass-card p-6 space-y-4">
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-blue-500" /> Configuração
            </h2>

            {/* Form Fields (Simplificado para o diff, mantendo funcionalidade) */}
            <div>
              <label className="block text-sm text-gray-400 mb-1">Chave API OpenAI</label>
              <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500" placeholder="sk-..." />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Prompt Sujeito</label>
              <textarea value={subjectPrompt} onChange={(e) => setSubjectPrompt(e.target.value)} className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm h-24 focus:outline-none focus:border-green-500" />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Prompt Avaliador</label>
              <textarea value={evaluatorPrompt} onChange={(e) => setEvaluatorPrompt(e.target.value)} className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm h-24 focus:outline-none focus:border-purple-500" />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Max Turnos</label>
              <input type="number" value={maxTurns} onChange={(e) => setMaxTurns(Number(e.target.value))} className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm" />
            </div>

            <button onClick={handleRunTest} disabled={isRunning} className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-medium py-2 rounded transition-all flex items-center justify-center gap-2">
              {isRunning ? <RefreshCw className="animate-spin w-4 h-4" /> : <Play className="w-4 h-4" />}
              {isRunning ? "Rodando..." : "Iniciar Avaliação"}
            </button>
          </div>
        </div>

        {/* Resultados e Live View */}
        <div className="lg:col-span-2 space-y-6">

          {/* Componente de Resultado Detalhado */}
          {result && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="glass-card p-0 overflow-hidden">
              <div className={clsx("p-6 border-b border-gray-800", result.status_final.aprovado ? "bg-green-900/20" : "bg-red-900/20")}>
                <div className="flex justify-between items-start">
                  <div>
                    <h2 className={clsx("text-2xl font-bold mb-2 flex items-center gap-2", result.status_final.aprovado ? "text-green-400" : "text-red-400")}>
                      {result.status_final.aprovado ? <CheckCircle /> : <XCircle />}
                      {result.resumo.resultado}
                    </h2>
                    <p className="text-gray-400 text-sm">{result.resumo.recomendacoes[0]}</p>
                  </div>
                  <div className="text-right">
                    <div className="text-4xl font-bold">{result.scores.score_geral}</div>
                    <div className="text-xs text-gray-400 uppercase tracking-wider">Score Geral</div>
                  </div>
                </div>
              </div>

              {/* Score Grid */}
              <div className="grid grid-cols-5 gap-px bg-gray-800 border-b border-gray-800">
                {Object.entries(result.scores).map(([key, val]) => {
                  if (key === 'score_geral') return null;
                  return (
                    <div key={key} className="bg-gray-900 p-3 text-center">
                      <div className="text-lg font-bold text-white mb-1">{val}</div>
                      <div className="text-[10px] text-gray-500 uppercase truncate" title={key.replace('_', ' ')}>{key.replace('_', ' ')}</div>
                    </div>
                  )
                })}
              </div>

              <div className="p-6 space-y-6">
                {/* Análise por Categoria */}
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-gray-400 uppercase border-b border-gray-800 pb-2">Análise Detalhada</h3>
                  {(Object.entries(result.analise) as [keyof FullAnalysis, AnalysisCategory][]).map(([key, analysis]) => (
                    <div key={key} className="bg-gray-800/50 rounded p-3">
                      <div className="flex justify-between items-center mb-2">
                        <span className="font-medium capitalize text-blue-300">{key.replace('_', ' ')}</span>
                        <span className={clsx("text-xs font-bold px-2 py-0.5 rounded", analysis.score > 70 ? "bg-green-900 text-green-300" : "bg-red-900 text-red-300")}>{analysis.score}/100</span>
                      </div>
                      <p className="text-sm text-gray-300">{analysis.comentario}</p>
                      {/* Exibir violações se existirem (ex: compliance) */}
                      {(analysis as any).violacoes_criticas?.length > 0 && (
                        <div className="mt-2 text-xs text-red-400 bg-red-900/20 p-2 rounded border border-red-900/50">
                          <strong>Violações Críticas:</strong>
                          <ul className="list-disc list-inside mt-1">{(analysis as any).violacoes_criticas.map((v: string, i: number) => <li key={i}>{v}</li>)}</ul>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Pontos Fortes e Fracos */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <h4 className="text-xs uppercase text-green-500 font-bold mb-2">Pontos Fortes</h4>
                    <ul className="text-sm text-gray-300 space-y-1 list-disc list-inside">
                      {result.resumo.pontos_fortes.map((p, i) => <li key={i}>{p}</li>)}
                    </ul>
                  </div>
                  <div>
                    <h4 className="text-xs uppercase text-red-500 font-bold mb-2">Pontos Fracos</h4>
                    <ul className="text-sm text-gray-300 space-y-1 list-disc list-inside">
                      {result.resumo.pontos_fracos.map((p, i) => <li key={i}>{p}</li>)}
                    </ul>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* Transcript Panel */}
          <div className="flex flex-col h-[500px] glass-card overflow-hidden">
            <div className="p-4 border-b border-gray-800 bg-gray-900/50 flex justify-between items-center">
              <h2 className="font-semibold text-gray-200">Interação ao Vivo</h2>
              <button onClick={() => setTranscript([])} className="text-xs text-gray-500 hover:text-white">Limpar</button>
            </div>
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-6">
              <AnimatePresence>
                {transcript.map((msg, idx) => (
                  <motion.div key={idx} initial={{ opacity: 0, x: msg.role === 'evaluator' ? -20 : 20 }} animate={{ opacity: 1, x: 0 }} className={clsx("flex flex-col max-w-[80%]", msg.role === 'evaluator' ? "self-start" : "self-end items-end")}>
                    <span className={clsx("text-xs mb-1 px-2", msg.role === 'evaluator' ? "text-purple-400" : "text-green-400")}>{msg.role === 'evaluator' ? "AVALIADOR" : "SUJEITO"}</span>
                    <div className={clsx("p-4 rounded-2xl text-sm leading-relaxed", msg.role === 'evaluator' ? "bg-purple-900/30 border border-purple-500/30 rounded-tl-none" : "bg-green-900/30 border border-green-500/30 rounded-tr-none")}>{msg.content}</div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
