"use client";

import React, { useState, useEffect, useRef } from "react";
import { useParams } from "next/navigation";
import { Play, Pause, Terminal, Zap, CheckCircle, ChevronDown, ChevronUp, MessageSquare, FileText, Scale } from "lucide-react";
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
    const [liveMessages, setLiveMessages] = useState<{ role: string, content: string }[]>([]);
    const [currentIteration, setCurrentIteration] = useState(0);
    const [selectedRun, setSelectedRun] = useState<TestRun | null>(null);

    // Expandable sections state
    const [expandedSections, setExpandedSections] = useState<{
        chat: boolean;
        prompt: boolean;
        analysis: boolean;
    }>({ chat: true, prompt: false, analysis: false });

    const toggleSection = (section: 'chat' | 'prompt' | 'analysis') => {
        setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
    };

    const logsRef = useRef<HTMLDivElement>(null);
    const chatRef = useRef<HTMLDivElement>(null);

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

    useEffect(() => {
        if (chatRef.current) {
            chatRef.current.scrollTop = chatRef.current.scrollHeight;
        }
    }, [liveMessages]);

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
        setLiveMessages([]);
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
                setLiveMessages([]);
                addLog(`>>> ITERAÇÃO ${event.iteration} <<<`, "system");
                break;
            case "message":
                setLiveMessages(prev => [...prev, { role: event.role, content: event.content }]);
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

    const selectRun = (run: TestRun) => {
        setSelectedRun(run);
        // Convert transcript to liveMessages format for display
        if (run.transcript && run.transcript.length > 0) {
            setLiveMessages(run.transcript.map((t: any) => ({ role: t.role, content: t.content })));
        } else {
            setLiveMessages([]);
        }
        setCurrentPrompt(run.subject_instruction || "");
        setCurrentIteration(run.iteration);
    };

    const clearSelection = () => {
        setSelectedRun(null);
        setLiveMessages([]);
        if (runs.length > 0) {
            const last = runs[runs.length - 1];
            setCurrentPrompt(last.subject_instruction);
            setCurrentIteration(runs.length);
        }
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

            <div className="flex-1 grid grid-cols-12 gap-4 overflow-hidden">

                {/* ESQUERDA: LOGS + GRÁFICO */}
                <div className="col-span-3 flex flex-col gap-4 overflow-hidden">

                    {/* GRÁFICO COMPACTO - só mostra se tiver dados */}
                    {runs.length > 0 && (
                        <div className="glass-card p-3 h-24 flex items-end gap-1 overflow-x-auto">
                            {runs.map((run, i) => (
                                <motion.div
                                    initial={{ height: 0 }}
                                    animate={{ height: `${Math.max(run.score || 0, 5)}%` }}
                                    key={run.id}
                                    onClick={() => selectRun(run)}
                                    className={clsx(
                                        "w-4 rounded-t relative group flex-shrink-0 cursor-pointer hover:opacity-80",
                                        selectedRun?.id === run.id ? "ring-2 ring-white" : "",
                                        (run.score || 0) >= 90 ? "bg-green-500" : (run.score || 0) >= 70 ? "bg-yellow-500" : "bg-red-500"
                                    )}
                                >
                                    <div className="absolute -top-4 left-1/2 -translate-x-1/2 text-[10px] font-bold">{run.score || 0}</div>
                                </motion.div>
                            ))}
                        </div>
                    )}

                    {/* LOGS */}
                    <div className="glass-card p-0 flex-1 flex flex-col overflow-hidden bg-black border border-gray-800">
                        <div className="bg-gray-900 p-2 text-xs font-mono text-gray-400 flex items-center gap-2 border-b border-gray-800">
                            <Terminal className="w-3 h-3" /> Console
                        </div>
                        <div ref={logsRef} className="flex-1 overflow-y-auto p-2 space-y-1 font-mono text-[10px]">
                            {logs.length === 0 && <span className="text-gray-700">Aguardando...</span>}
                            {logs.map((log, i) => (
                                <div key={i} className={clsx(
                                    log.includes("[ERROR]") ? "text-red-400" :
                                        log.includes("[SUCCESS]") ? "text-green-400" :
                                            log.includes("[SYSTEM]") ? "text-blue-400" :
                                                log.includes("[WARNING]") ? "text-yellow-400" :
                                                    "text-gray-500"
                                )}>
                                    {log}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* CENTRO: CHAT EM TEMPO REAL (DESTAQUE) */}
                <div className="col-span-6 flex flex-col overflow-hidden">
                    <div className={clsx(
                        "glass-card flex-1 flex flex-col overflow-hidden transition-all duration-300",
                        isLooping && liveMessages.length > 0
                            ? "border-2 border-green-500/50 shadow-lg shadow-green-500/10"
                            : "border border-gray-800"
                    )}>
                        {/* Header do Chat */}
                        <div className={clsx(
                            "p-3 border-b flex items-center justify-between",
                            isLooping && liveMessages.length > 0
                                ? "border-green-500/30 bg-green-900/20"
                                : selectedRun
                                    ? "border-blue-500/30 bg-blue-900/20"
                                    : "border-gray-800 bg-gray-900/50"
                        )}>
                            <h3 className={clsx(
                                "text-sm font-bold flex items-center gap-2",
                                isLooping && liveMessages.length > 0 ? "text-green-400" :
                                    selectedRun ? "text-blue-400" : "text-gray-400"
                            )}>
                                {isLooping && liveMessages.length > 0 ? (
                                    <>
                                        <Zap className="w-4 h-4 animate-pulse" />
                                        Conversa em Tempo Real
                                        <span className="ml-2 px-2 py-0.5 bg-green-500/20 text-green-400 text-[10px] rounded-full animate-pulse">
                                            AO VIVO
                                        </span>
                                    </>
                                ) : selectedRun ? (
                                    <>
                                        <CheckCircle className="w-4 h-4" />
                                        Iteração {selectedRun.iteration} - {selectedRun.transcript?.length || 0} mensagens
                                    </>
                                ) : (
                                    <>
                                        <Zap className="w-4 h-4" />
                                        {currentIteration > 0 ? `Prompt da Iteração ${currentIteration}` : "Aguardando Execução"}
                                    </>
                                )}
                            </h3>
                            <div className="flex items-center gap-2">
                                {selectedRun && !isLooping && (
                                    <button
                                        onClick={clearSelection}
                                        className="text-xs text-gray-400 hover:text-white px-2 py-1 bg-gray-800 rounded"
                                    >
                                        ✕ Fechar
                                    </button>
                                )}
                                {isLooping && (
                                    <div className="flex items-center gap-2 text-xs text-gray-500">
                                        <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                                        {liveMessages.length} mensagens
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Conteúdo com seções expansíveis */}
                        <div className="flex-1 overflow-y-auto">
                            {/* Modo ao vivo */}
                            {isLooping && liveMessages.length > 0 && (
                                <div ref={chatRef} className="p-4 space-y-3">
                                    {liveMessages.map((msg, i) => (
                                        <motion.div
                                            key={i}
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            className={clsx(
                                                "p-4 rounded-xl max-w-[85%] shadow-lg",
                                                msg.role === "evaluator"
                                                    ? "bg-gradient-to-br from-blue-900/80 to-blue-800/50 border border-blue-600/50 ml-0 mr-auto"
                                                    : "bg-gradient-to-br from-purple-900/80 to-purple-800/50 border border-purple-600/50 ml-auto mr-0"
                                            )}
                                        >
                                            <div className={clsx(
                                                "text-[11px] font-bold mb-2 flex items-center gap-2",
                                                msg.role === "evaluator" ? "text-blue-300" : "text-purple-300"
                                            )}>
                                                {msg.role === "evaluator" ? "🧑 TESTADOR" : "🤖 AGENTE"}
                                            </div>
                                            <div className="text-gray-100 text-sm leading-relaxed">{msg.content}</div>
                                        </motion.div>
                                    ))}
                                </div>
                            )}

                            {/* Modo visualização de run selecionado */}
                            {selectedRun && !isLooping && (
                                <div className="divide-y divide-gray-800">
                                    {/* SEÇÃO: CHAT */}
                                    <div>
                                        <button
                                            onClick={() => toggleSection('chat')}
                                            className="w-full p-3 flex items-center justify-between hover:bg-gray-800/50 transition-colors"
                                        >
                                            <span className="text-sm font-bold text-blue-400 flex items-center gap-2">
                                                <MessageSquare className="w-4 h-4" />
                                                Conversa ({liveMessages.length} mensagens)
                                            </span>
                                            {expandedSections.chat ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
                                        </button>
                                        {expandedSections.chat && (
                                            <div className="p-3 space-y-2 bg-gray-900/30 max-h-64 overflow-y-auto">
                                                {liveMessages.length === 0 ? (
                                                    <div className="text-gray-600 text-xs text-center py-4">Sem mensagens registradas</div>
                                                ) : (
                                                    liveMessages.map((msg, i) => (
                                                        <div
                                                            key={i}
                                                            className={clsx(
                                                                "p-3 rounded-lg max-w-[90%] text-sm",
                                                                msg.role === "evaluator"
                                                                    ? "bg-blue-900/50 border border-blue-700/50 ml-0 mr-auto"
                                                                    : "bg-purple-900/50 border border-purple-700/50 ml-auto mr-0"
                                                            )}
                                                        >
                                                            <div className={clsx(
                                                                "text-[10px] font-bold mb-1",
                                                                msg.role === "evaluator" ? "text-blue-400" : "text-purple-400"
                                                            )}>
                                                                {msg.role === "evaluator" ? "🧑 TESTADOR" : "🤖 AGENTE"}
                                                            </div>
                                                            <div className="text-gray-200">{msg.content}</div>
                                                        </div>
                                                    ))
                                                )}
                                            </div>
                                        )}
                                    </div>

                                    {/* SEÇÃO: PROMPT */}
                                    <div>
                                        <button
                                            onClick={() => toggleSection('prompt')}
                                            className="w-full p-3 flex items-center justify-between hover:bg-gray-800/50 transition-colors"
                                        >
                                            <span className="text-sm font-bold text-green-400 flex items-center gap-2">
                                                <FileText className="w-4 h-4" />
                                                Prompt Utilizado
                                            </span>
                                            {expandedSections.prompt ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
                                        </button>
                                        {expandedSections.prompt && (
                                            <div className="p-3 bg-gray-900/30 max-h-64 overflow-y-auto">
                                                <pre className="text-xs text-gray-300 whitespace-pre-wrap font-mono">
                                                    {selectedRun.subject_instruction || "Prompt não disponível"}
                                                </pre>
                                            </div>
                                        )}
                                    </div>

                                    {/* SEÇÃO: ANÁLISE DO JUIZ */}
                                    <div>
                                        <button
                                            onClick={() => toggleSection('analysis')}
                                            className="w-full p-3 flex items-center justify-between hover:bg-gray-800/50 transition-colors"
                                        >
                                            <span className="text-sm font-bold text-yellow-400 flex items-center gap-2">
                                                <Scale className="w-4 h-4" />
                                                Análise do Juiz {selectedRun.score !== null && `(Score: ${selectedRun.score})`}
                                            </span>
                                            {expandedSections.analysis ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
                                        </button>
                                        {expandedSections.analysis && (
                                            <div className="p-3 bg-gray-900/30 max-h-80 overflow-y-auto space-y-3">
                                                {selectedRun.evaluation_result ? (
                                                    <>
                                                        {/* Score Geral */}
                                                        <div className="flex items-center gap-3 p-3 bg-gray-800/50 rounded-lg">
                                                            <div className={clsx(
                                                                "text-3xl font-bold",
                                                                (selectedRun.score || 0) >= 90 ? "text-green-400" :
                                                                    (selectedRun.score || 0) >= 70 ? "text-yellow-400" : "text-red-400"
                                                            )}>
                                                                {selectedRun.score || 0}
                                                            </div>
                                                            <div className="text-xs text-gray-400">
                                                                Score Geral
                                                            </div>
                                                        </div>

                                                        {/* Scores detalhados */}
                                                        {selectedRun.evaluation_result.scores && (
                                                            <div className="grid grid-cols-2 gap-2">
                                                                {Object.entries(selectedRun.evaluation_result.scores).map(([key, value]) => (
                                                                    <div key={key} className="p-2 bg-gray-800/30 rounded text-xs">
                                                                        <div className="text-gray-500 capitalize">{key.replace(/_/g, ' ')}</div>
                                                                        <div className="text-white font-bold">{String(value)}</div>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        )}

                                                        {/* Resumo */}
                                                        {selectedRun.evaluation_result.resumo && (
                                                            <div className="space-y-2">
                                                                {selectedRun.evaluation_result.resumo.pontos_fortes && (
                                                                    <div>
                                                                        <div className="text-xs font-bold text-green-400 mb-1">✅ Pontos Fortes</div>
                                                                        <ul className="text-xs text-gray-300 space-y-1">
                                                                            {selectedRun.evaluation_result.resumo.pontos_fortes.map((p: string, i: number) => (
                                                                                <li key={i}>• {p}</li>
                                                                            ))}
                                                                        </ul>
                                                                    </div>
                                                                )}
                                                                {selectedRun.evaluation_result.resumo.pontos_fracos && (
                                                                    <div>
                                                                        <div className="text-xs font-bold text-red-400 mb-1">⚠️ Pontos Fracos</div>
                                                                        <ul className="text-xs text-gray-300 space-y-1">
                                                                            {selectedRun.evaluation_result.resumo.pontos_fracos.map((p: string, i: number) => (
                                                                                <li key={i}>• {p}</li>
                                                                            ))}
                                                                        </ul>
                                                                    </div>
                                                                )}
                                                                {selectedRun.evaluation_result.resumo.recomendacoes && (
                                                                    <div>
                                                                        <div className="text-xs font-bold text-blue-400 mb-1">💡 Recomendações</div>
                                                                        <ul className="text-xs text-gray-300 space-y-1">
                                                                            {selectedRun.evaluation_result.resumo.recomendacoes.map((p: string, i: number) => (
                                                                                <li key={i}>• {p}</li>
                                                                            ))}
                                                                        </ul>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )}
                                                    </>
                                                ) : (
                                                    <div className="text-gray-600 text-xs text-center py-4">Análise não disponível</div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Estado inicial - sem iteração selecionada e sem loop */}
                            {!selectedRun && !isLooping && (
                                <div className="p-4">
                                    <textarea
                                        value={currentPrompt || "Clique em 'Iniciar Otimização' para começar ou selecione uma iteração do histórico..."}
                                        readOnly
                                        className="w-full h-full min-h-[300px] bg-transparent text-gray-400 text-sm resize-none font-mono focus:outline-none"
                                    />
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* DIREITA: HISTÓRICO */}
                <div className="col-span-3 glass-card p-0 flex flex-col overflow-hidden">
                    <div className="p-3 border-b border-gray-800 bg-gray-900/50">
                        <h2 className="text-sm font-bold flex items-center gap-2">Histórico</h2>
                    </div>
                    <div className="flex-1 overflow-y-auto p-2 space-y-2">
                        {runs.length === 0 && <div className="text-gray-600 text-xs text-center py-4">Sem execuções</div>}
                        {runs.slice().reverse().map((run) => (
                            <div
                                key={run.id}
                                onClick={() => selectRun(run)}
                                className={clsx(
                                    "p-2 rounded transition-colors cursor-pointer border-l-2",
                                    selectedRun?.id === run.id
                                        ? "bg-blue-900/50 border-l-blue-500"
                                        : "bg-gray-800/50 hover:bg-gray-800 border-l-transparent hover:border-l-blue-500"
                                )}
                            >
                                <div className="flex justify-between items-center mb-1">
                                    <span className="text-[10px] font-bold text-gray-500">IT. {run.iteration}</span>
                                    <span className={clsx("text-[10px] font-bold px-1.5 py-0.5 rounded",
                                        (run.score || 0) >= 90 ? "bg-green-900 text-green-300" :
                                            (run.score || 0) >= 70 ? "bg-yellow-900 text-yellow-300" : "bg-red-900 text-red-300"
                                    )}>
                                        {run.score || 0}
                                    </span>
                                </div>
                                <div className="text-[10px] text-gray-500 truncate">
                                    {run.status === "completed"
                                        ? `✅ ${run.transcript?.length || 0} msgs`
                                        : run.status === "running"
                                            ? "🔄 Rodando..."
                                            : run.status === "failed"
                                                ? "❌ Falhou"
                                                : "—"}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

            </div>
        </main>
    );
}
