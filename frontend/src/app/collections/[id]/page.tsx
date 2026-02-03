"use client";

import React, { useState, useEffect, useRef } from "react";
import { useParams } from "next/navigation";
import { Play, Pause, Terminal, Zap, CheckCircle, ArrowUp, Clock, AlertTriangle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import clsx from "clsx";

interface Collection {
    id: string;
    name: string;
    base_subject_instruction: string;
    openai_api_key: string;
}

interface TestRun {
    id: string;
    iteration: number;
    status: string;
    score: number;
    subject_instruction: string;
    evaluation_result: any;
    transcript: any[];
    created_at?: string;
}

export default function CollectionOptimizationPage() {
    const { id } = useParams();
    const [collection, setCollection] = useState<Collection | null>(null);
    const [runs, setRuns] = useState<TestRun[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    // Loop State
    const [isLooping, setIsLooping] = useState(false);
    const [currentPrompt, setCurrentPrompt] = useState("");
    const [logs, setLogs] = useState<string[]>([]);
    const [currentIteration, setCurrentIteration] = useState(0);

    const logsRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (id) {
            fetchData();
        }
    }, [id]);

    useEffect(() => {
        if (logsRef.current) {
            logsRef.current.scrollTop = logsRef.current.scrollHeight;
        }
    }, [logs]);

    const fetchData = async () => {
        try {
            const [colRes, runRes] = await Promise.all([
                fetch(`http://127.0.0.1:8000/api/collections/${id}`),
                fetch(`http://127.0.0.1:8000/api/collections/${id}/runs`)
            ]);

            const colData = await colRes.json();
            const runData = await runRes.json();

            setCollection(colData);
            setRuns(runData);

            // Set initial state based on history
            if (runData.length > 0) {
                const last = runData[runData.length - 1];
                setCurrentPrompt(last.subject_instruction);
                setCurrentIteration(runData.length);
            } else {
                setCurrentPrompt(colData.base_subject_instruction);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setIsLoading(false);
        }
    };

    const startLoop = async () => {
        if (isLooping) return;
        setIsLooping(true);
        addLog("Iniciando Loop de Otimização...", "info");

        try {
            const response = await fetch(`http://127.0.0.1:8000/api/collections/${id}/run`, {
                method: "POST"
            });

            if (!response.ok) throw new Error("Erro ao iniciar loop");
            if (!response.body) throw new Error("Sem corpo de resposta");

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = "";

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
                        } catch (e) {
                            console.error(e);
                        }
                    }
                }
            }
        } catch (e: any) {
            addLog(`Erro Crítico: ${e.message}`, "error");
        } finally {
            setIsLooping(false);
            addLog("Loop finalizado.", "info");
            fetchData(); // Refresh list
        }
    };

    const handleEvent = (event: any) => {
        switch (event.type) {
            case "status":
                addLog(event.content, "info");
                break;
            case "iteration_start":
                setCurrentIteration(event.iteration);
                setCurrentPrompt(event.prompt);
                addLog(`>>> ITERAÇÃO ${event.iteration} <<<`, "system");
                break;
            case "result":
                addLog(`RESULTADO: Score ${event.score}/100`, event.score >= 90 ? "success" : "warning");
                // Optimistically add to run list (or wait for fetch)
                break;
            case "optimization":
                addLog("PROMPT OTIMIZADO PELO AGENTE", "system");
                setCurrentPrompt(event.new_prompt);
                break;
            case "error":
                addLog(`ERRO: ${event.content}`, "error");
                break;
            case "done":
                addLog(`CONCLUÍDO: ${event.reason}`, "success");
                setIsLooping(false);
                break;
        }
    };

    const addLog = (msg: string, type: "info" | "error" | "success" | "warning" | "system" = "info") => {
        setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] [${type.toUpperCase()}] ${msg}`]);
    };

    if (!collection) return <div className="text-white p-8">Carregando...</div>;

    return (
        <main className="min-h-screen bg-black text-white p-6 flex flex-col h-screen overflow-hidden">
            {/* HEADER */}
            <header className="flex justify-between items-center mb-6 pb-4 border-b border-gray-800">
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-2">
                        <span className="text-blue-500">Coleção:</span> {collection.name}
                    </h1>
                    <p className="text-sm text-gray-500 font-mono mt-1">ID: {collection.id}</p>
                </div>
                <div className="flex gap-4">
                    <div className="text-right">
                        <div className="text-xs text-gray-400">Melhor Score</div>
                        <div className="text-xl font-bold text-green-400">
                            {runs.reduce((max, r) => Math.max(max, r.score), 0)}/100
                        </div>
                    </div>
                    <button
                        onClick={startLoop}
                        disabled={isLooping}
                        className={clsx(
                            "px-6 py-2 rounded font-bold flex items-center gap-2 transition-all",
                            isLooping ? "bg-red-500/20 text-red-500 cursor-not-allowed" : "bg-green-600 hover:bg-green-500 text-white"
                        )}
                    >
                        {isLooping ? <Pause className="w-5 h-5 animate-pulse" /> : <Play className="w-5 h-5" />}
                        {isLooping ? "Rodando..." : "Iniciar Otimização"}
                    </button>
                </div>
            </header>

            <div className="flex-1 grid grid-cols-12 gap-6 overflow-hidden">

                {/* ESQUERDA: VISUALIZAÇÃO E LOGS */}
                <div className="col-span-8 flex flex-col gap-6 overflow-hidden">

                    {/* GRÁFICO (Barras Simplificadas) */}
                    <div className="glass-card p-4 h-48 flex items-end gap-2 overflow-x-auto">
                        {runs.length === 0 && <div className="text-gray-500 w-full text-center self-center">Sem histórico de execuções</div>}

                        {runs.map((run, i) => (
                            <motion.div
                                initial={{ height: 0 }}
                                animate={{ height: `${run.score}%` }}
                                key={run.id}
                                className={clsx(
                                    "w-8 rounded-t relative group flex-shrink-0",
                                    run.score >= 90 ? "bg-green-500" : run.score >= 70 ? "bg-yellow-500" : "bg-red-500"
                                )}
                            >
                                <div className="absolute -top-6 left-1/2 -translate-x-1/2 text-xs font-bold">{run.score}</div>
                                <div className="absolute bottom-1 left-1/2 -translate-x-1/2 text-[10px] text-black/50 font-bold">{i + 1}</div>

                                {/* Tooltip */}
                                <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-xs p-2 rounded opacity-0 group-hover:opacity-100 whitespace-nowrap z-10 pointer-events-none border border-gray-700">
                                    Iteração {run.iteration} <br />
                                    {new Date(run.created_at || Date.now()).toLocaleTimeString()}
                                </div>
                            </motion.div>
                        ))}
                    </div>

                    {/* PROMPT ATUAL */}
                    <div className="glass-card p-4 flex-1 flex flex-col overflow-hidden border border-blue-500/30">
                        <h3 className="text-sm font-bold text-blue-400 mb-2 flex items-center gap-2">
                            <Zap className="w-4 h-4" /> Prompt Atual do Sujeito (Iteração {currentIteration})
                        </h3>
                        <textarea
                            value={currentPrompt}
                            readOnly
                            className="w-full flex-1 bg-black/50 text-gray-300 text-sm p-4 rounded resize-none font-mono focus:outline-none border border-gray-800"
                        />
                    </div>

                    {/* LOGS */}
                    <div className="glass-card p-0 h-48 flex flex-col overflow-hidden bg-black border border-gray-800">
                        <div className="bg-gray-900 p-2 text-xs font-mono text-gray-400 flex items-center gap-2 border-b border-gray-800">
                            <Terminal className="w-3 h-3" /> Console de Execução
                        </div>
                        <div ref={logsRef} className="flex-1 overflow-y-auto p-4 space-y-1 font-mono text-xs">
                            {logs.length === 0 && <span className="text-gray-700">Aguardando início...</span>}
                            {logs.map((log, i) => (
                                <div key={i} className={clsx(
                                    log.includes("[ERROR]") ? "text-red-400" :
                                        log.includes("[SUCCESS]") ? "text-green-400" :
                                            log.includes("[SYSTEM]") ? "text-blue-400" :
                                                "text-gray-400"
                                )}>
                                    {log}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* DIREITA: HISTÓRICO */}
                <div className="col-span-4 glass-card p-0 flex flex-col overflow-hidden">
                    <div className="p-4 border-b border-gray-800 bg-gray-900/50">
                        <h2 className="font-bold flex items-center gap-2">Hitórico de Execuções</h2>
                    </div>
                    <div className="flex-1 overflow-y-auto p-4 space-y-3">
                        {runs.slice().reverse().map((run) => (
                            <div key={run.id} className="bg-gray-800/50 p-3 rounded hover:bg-gray-800 transition-colors cursor-pointer border-l-4 border-l-transparent hover:border-l-blue-500">
                                <div className="flex justify-between items-start mb-2">
                                    <span className="text-xs font-bold text-gray-500 uppercase">Iteração {run.iteration}</span>
                                    <span className={clsx("text-xs font-bold px-2 py-0.5 rounded",
                                        run.score >= 90 ? "bg-green-900 text-green-300" :
                                            run.score >= 70 ? "bg-yellow-900 text-yellow-300" : "bg-red-900 text-red-300"
                                    )}>
                                        Score: {run.score}
                                    </span>
                                </div>
                                <div className="text-xs text-gray-400 mb-2">
                                    {/* Mostra resumo da avaliação se houver */}
                                    {run.evaluation_result?.resumo?.recomendacoes?.[0] || "Sem recomendações"}
                                </div>
                                <div className="flex justify-between text-[10px] text-gray-600">
                                    <span>{new Date(run.created_at || Date.now()).toLocaleString()}</span>
                                    <span>{run.status}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

            </div>
        </main>
    );
}
