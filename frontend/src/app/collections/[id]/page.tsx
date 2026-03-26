"use client";

import React, { useState, useEffect, useRef } from "react";
import { useParams } from "next/navigation";
import {
    Play, Pause, Terminal, Zap, CheckCircle, ChevronDown, ChevronUp,
    MessageSquare, FileText, Scale, Upload, Trash2, BookOpen, AlertTriangle,
    Loader2
} from "lucide-react";
import { motion } from "framer-motion";
import clsx from "clsx";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

interface Collection {
    id: string;
    name: string;
    base_subject_instruction: string;
    openai_api_key: string;
    subject_model?: string;
}

interface TranscriptMessage {
    role: string;
    content: string;
}

interface RuleViolation {
    severidade?: string;
    regra?: string;
    trecho_documento?: string;
    trecho_resposta?: string;
    sugestao_correcao?: string;
}

interface MissingBehavior {
    impacto?: string;
    comportamento?: string;
    sugestao_correcao?: string;
}

interface AnalysisItem {
    score?: number;
    comentario?: string;
    violacoes?: RuleViolation[];
    comportamentos_ausentes?: MissingBehavior[];
}

interface EvaluationSummary {
    resultado?: string;
    gaps_criticos?: string[];
    pontos_fortes?: string[];
    pontos_fracos?: string[];
    recomendacoes_prompt?: string[];
    recomendacoes?: string[];
}

interface EvaluationData {
    documentos_utilizados?: string[];
    scores?: Record<string, unknown>;
    analise?: Record<string, AnalysisItem>;
    resumo?: EvaluationSummary;
}

type StreamEvent = {
    type: string;
    [key: string]: unknown;
};

interface TestRun {
    id: string;
    iteration: number;
    status: string;
    score: number;
    subject_instruction: string;
    evaluation_result: EvaluationData | null;
    transcript: TranscriptMessage[];
    created_at?: string;
}

interface ReferenceDocument {
    id: string;
    collection_id: string;
    filename: string;
    file_type: string;
    content_text: string;
    file_size_bytes: number;
    created_at: string;
}

interface DocumentTestRun {
    id: string;
    collection_id: string;
    status: string;
    subject_instruction: string;
    document_ids: string[];
    transcript: TranscriptMessage[];
    evaluation_result: EvaluationData | null;
    score: number;
    created_at: string;
}

type RightPanelTab = "history" | "documents";

export default function CollectionOptimizationPage() {
    const { id } = useParams();
    const [collection, setCollection] = useState<Collection | null>(null);
    const [runs, setRuns] = useState<TestRun[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    // Loop State
    const [isLooping, setIsLooping] = useState(false);
    const [currentPrompt, setCurrentPrompt] = useState("");
    const [logs, setLogs] = useState<string[]>([]);
    const [liveMessages, setLiveMessages] = useState<{ role: string; content: string }[]>([]);
    const [currentIteration, setCurrentIteration] = useState(0);
    const [selectedRun, setSelectedRun] = useState<TestRun | null>(null);

    // Document state
    const [documents, setDocuments] = useState<ReferenceDocument[]>([]);
    const [documentTestRuns, setDocumentTestRuns] = useState<DocumentTestRun[]>([]);
    const [isUploading, setIsUploading] = useState(false);
    const [isDocTesting, setIsDocTesting] = useState(false);
    const [selectedDocRun, setSelectedDocRun] = useState<DocumentTestRun | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Right panel tab
    const [rightTab, setRightTab] = useState<RightPanelTab>("history");

    // Expandable sections state
    const [expandedSections, setExpandedSections] = useState<{
        chat: boolean;
        prompt: boolean;
        analysis: boolean;
    }>({ chat: true, prompt: false, analysis: false });

    const toggleSection = (section: "chat" | "prompt" | "analysis") => {
        setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
    };

    const logsRef = useRef<HTMLDivElement>(null);
    const chatRef = useRef<HTMLDivElement>(null);

    const getErrorMessage = (error: unknown): string =>
        error instanceof Error ? error.message : "Erro desconhecido";

    useEffect(() => {
        if (id) fetchData();
    }, [id]);

    useEffect(() => {
        if (logsRef.current) logsRef.current.scrollTop = logsRef.current.scrollHeight;
    }, [logs]);

    useEffect(() => {
        if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
    }, [liveMessages]);

    const fetchData = async () => {
        try {
            const [colRes, runRes, docRes, docTestRes] = await Promise.all([
                fetch(`${API_BASE_URL}/api/collections/${id}`),
                fetch(`${API_BASE_URL}/api/collections/${id}/runs`),
                fetch(`${API_BASE_URL}/api/collections/${id}/documents`),
                fetch(`${API_BASE_URL}/api/collections/${id}/document-test-runs`),
            ]);

            const colData = await colRes.json();
            const runData = await runRes.json();
            const docData = await docRes.json();
            const docTestData = await docTestRes.json();

            setCollection(colData);
            setRuns(runData);
            setDocuments(docData);
            setDocumentTestRuns(docTestData);

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

    // --- Optimization Loop ---
    const startLoop = async () => {
        if (isLooping || isDocTesting) return;
        setIsLooping(true);
        setLiveMessages([]);
        setSelectedRun(null);
        setSelectedDocRun(null);
        addLog("Iniciando Loop de Otimização...", "info");

        try {
            const response = await fetch(`${API_BASE_URL}/api/collections/${id}/run`, { method: "POST" });
            if (!response.ok) throw new Error("Erro ao iniciar loop");
            if (!response.body) throw new Error("Sem corpo de resposta");
            await processSSE(response.body, handleEvent);
        } catch (e: unknown) {
            addLog(`Erro Crítico: ${getErrorMessage(e)}`, "error");
        } finally {
            setIsLooping(false);
            addLog("Loop finalizado.", "info");
            fetchData();
        }
    };

    // --- Document Test ---
    const startDocumentTest = async () => {
        if (isLooping || isDocTesting) return;
        if (documents.length === 0) {
            addLog("Nenhum documento de referência. Faça upload primeiro.", "error");
            return;
        }
        setIsDocTesting(true);
        setLiveMessages([]);
        setSelectedRun(null);
        setSelectedDocRun(null);
        addLog("Iniciando Teste com Documentos de Referência...", "info");

        try {
            const response = await fetch(`${API_BASE_URL}/api/collections/${id}/run-document-test`, { method: "POST" });
            if (!response.ok) {
                const err = await response.json().catch(() => ({ detail: `HTTP ${response.status}` }));
                throw new Error(err.detail || `Erro ${response.status}`);
            }
            if (!response.body) throw new Error("Sem corpo de resposta");
            await processSSE(response.body, handleDocTestEvent);
        } catch (e: unknown) {
            addLog(`Erro: ${getErrorMessage(e)}`, "error");
        } finally {
            setIsDocTesting(false);
            addLog("Teste com documentos finalizado.", "info");
            fetchData();
        }
    };

    // --- SSE Processing ---
    const processSSE = async (body: ReadableStream, handler: (event: StreamEvent) => void) => {
        const reader = body.getReader();
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
                    try {
                        const parsed: unknown = JSON.parse(line.substring(6));
                        if (parsed && typeof parsed === "object" && "type" in parsed) {
                            handler(parsed as StreamEvent);
                        }
                    } catch (error) {
                        console.error("Erro ao parsear evento SSE:", error);
                    }
                }
            }
        }
    };

    const handleEvent = (event: StreamEvent) => {
        switch (event.type) {
            case "status": addLog(String(event.content ?? ""), "info"); break;
            case "iteration_start":
                setCurrentIteration(Number(event.iteration ?? 0));
                setCurrentPrompt(String(event.prompt ?? ""));
                setLiveMessages([]);
                addLog(`>>> ITERAÇÃO ${String(event.iteration ?? "")} <<<`, "system");
                break;
            case "message":
                setLiveMessages(prev => [...prev, { role: String(event.role ?? ""), content: String(event.content ?? "") }]);
                break;
            case "result":
                addLog(`RESULTADO: Score ${String(event.score ?? 0)}/100`, Number(event.score ?? 0) >= 90 ? "success" : "warning");
                break;
            case "optimization":
                addLog("PROMPT OTIMIZADO PELO AGENTE", "system");
                setCurrentPrompt(String(event.new_prompt ?? ""));
                break;
            case "error": addLog(`ERRO: ${String(event.content ?? "")}`, "error"); break;
            case "done":
                addLog(`CONCLUÍDO: ${String(event.reason ?? "")}`, "success");
                setIsLooping(false);
                break;
        }
    };

    const handleDocTestEvent = (event: StreamEvent) => {
        switch (event.type) {
            case "status": addLog(String(event.content ?? ""), "info"); break;
            case "message":
                setLiveMessages(prev => [...prev, { role: String(event.role ?? ""), content: String(event.content ?? "") }]);
                break;
            case "result":
                addLog(`RESULTADO DOC TEST: Score ${String(event.score ?? 0)}/100`, Number(event.score ?? 0) >= 80 ? "success" : "warning");
                break;
            case "error": addLog(`ERRO: ${String(event.content ?? "")}`, "error"); break;
            case "done":
                addLog(`TESTE COM DOCUMENTOS CONCLUÍDO`, "success");
                setIsDocTesting(false);
                break;
        }
    };

    const addLog = (msg: string, type: "info" | "error" | "success" | "warning" | "system" = "info") => {
        setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] [${type.toUpperCase()}] ${msg}`]);
    };

    // --- Document Upload/Delete ---
    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;
        setIsUploading(true);

        for (const file of Array.from(files)) {
            const formData = new FormData();
            formData.append("file", file);
            try {
                const res = await fetch(`${API_BASE_URL}/api/collections/${id}/documents`, {
                    method: "POST",
                    body: formData,
                });
                if (res.ok) {
                    addLog(`Documento "${file.name}" enviado com sucesso`, "success");
                } else {
                    const err = await res.json().catch(() => ({ detail: "Erro desconhecido" }));
                    addLog(`Erro ao enviar "${file.name}": ${err.detail}`, "error");
                }
            } catch (err: unknown) {
                addLog(`Erro ao enviar "${file.name}": ${getErrorMessage(err)}`, "error");
            }
        }

        setIsUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
        fetchData();
    };

    const handleDeleteDocument = async (docId: string, filename: string) => {
        if (!confirm(`Remover o documento "${filename}"?`)) return;
        try {
            await fetch(`${API_BASE_URL}/api/documents/${docId}`, { method: "DELETE" });
            setDocuments(prev => prev.filter(d => d.id !== docId));
            addLog(`Documento "${filename}" removido`, "info");
        } catch (err: unknown) {
            addLog(`Erro ao remover: ${getErrorMessage(err)}`, "error");
        }
    };

    // --- Selection handlers ---
    const selectRun = (run: TestRun) => {
        setSelectedRun(run);
        setSelectedDocRun(null);
        if (run.transcript && run.transcript.length > 0) {
            setLiveMessages(run.transcript.map((t) => ({ role: t.role, content: t.content })));
        } else {
            setLiveMessages([]);
        }
        setCurrentPrompt(run.subject_instruction || "");
        setCurrentIteration(run.iteration);
    };

    const selectDocRun = (run: DocumentTestRun) => {
        setSelectedDocRun(run);
        setSelectedRun(null);
        if (run.transcript && run.transcript.length > 0) {
            setLiveMessages(run.transcript.map((t) => ({ role: t.role, content: t.content })));
        } else {
            setLiveMessages([]);
        }
        setCurrentPrompt(run.subject_instruction || "");
    };

    const clearSelection = () => {
        setSelectedRun(null);
        setSelectedDocRun(null);
        setLiveMessages([]);
        if (runs.length > 0) {
            const last = runs[runs.length - 1];
            setCurrentPrompt(last.subject_instruction);
            setCurrentIteration(runs.length);
        }
    };

    const formatFileSize = (bytes: number) => {
        if (bytes < 1024) return `${bytes}B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
    };

    const isRunning = isLooping || isDocTesting;

    if (isLoading || !collection) return <div className="text-white p-8">Carregando...</div>;

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
                <div className="flex gap-4 items-center">
                    <div className="text-right">
                        <div className="text-xs text-gray-400">Modelo</div>
                        <div className="text-sm font-mono text-purple-400">
                            {collection.subject_model || "gpt-4o"}
                        </div>
                    </div>
                    <div className="text-right">
                        <div className="text-xs text-gray-400">Melhor Score</div>
                        <div className="text-xl font-bold text-green-400">
                            {runs.reduce((max, r) => Math.max(max, r.score), 0)}/100
                        </div>
                    </div>

                    {/* Teste com Documentos */}
                    <button
                        onClick={startDocumentTest}
                        disabled={isRunning || documents.length === 0}
                        className={clsx(
                            "px-4 py-2 rounded font-bold flex items-center gap-2 transition-all text-sm",
                            isRunning || documents.length === 0
                                ? "bg-gray-800 text-gray-500 cursor-not-allowed"
                                : "bg-orange-600 hover:bg-orange-500 text-white"
                        )}
                        title={documents.length === 0 ? "Faça upload de documentos primeiro" : "Testar aderência aos documentos"}
                    >
                        {isDocTesting ? <Loader2 className="w-4 h-4 animate-spin" /> : <BookOpen className="w-4 h-4" />}
                        {isDocTesting ? "Testando..." : "Teste Docs"}
                    </button>

                    {/* Otimização */}
                    <button
                        onClick={startLoop}
                        disabled={isRunning}
                        className={clsx(
                            "px-6 py-2 rounded font-bold flex items-center gap-2 transition-all",
                            isRunning ? "bg-red-500/20 text-red-500 cursor-not-allowed" : "bg-green-600 hover:bg-green-500 text-white"
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

                    {/* GRÁFICO COMPACTO */}
                    {runs.length > 0 && (
                        <div className="glass-card p-3 h-24 flex items-end gap-1 overflow-x-auto">
                            {runs.map((run) => (
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

                {/* CENTRO: CHAT / RESULTADOS */}
                <div className="col-span-6 flex flex-col overflow-hidden">
                    <div className={clsx(
                        "glass-card flex-1 flex flex-col overflow-hidden transition-all duration-300",
                        isRunning && liveMessages.length > 0
                            ? isDocTesting
                                ? "border-2 border-orange-500/50 shadow-lg shadow-orange-500/10"
                                : "border-2 border-green-500/50 shadow-lg shadow-green-500/10"
                            : "border border-gray-800"
                    )}>
                        {/* Header do Chat */}
                        <div className={clsx(
                            "p-3 border-b flex items-center justify-between",
                            isRunning && liveMessages.length > 0
                                ? isDocTesting
                                    ? "border-orange-500/30 bg-orange-900/20"
                                    : "border-green-500/30 bg-green-900/20"
                                : selectedRun || selectedDocRun
                                    ? selectedDocRun
                                        ? "border-orange-500/30 bg-orange-900/20"
                                        : "border-blue-500/30 bg-blue-900/20"
                                    : "border-gray-800 bg-gray-900/50"
                        )}>
                            <h3 className={clsx(
                                "text-sm font-bold flex items-center gap-2",
                                isRunning && liveMessages.length > 0
                                    ? isDocTesting ? "text-orange-400" : "text-green-400"
                                    : selectedDocRun ? "text-orange-400"
                                    : selectedRun ? "text-blue-400" : "text-gray-400"
                            )}>
                                {isRunning && liveMessages.length > 0 ? (
                                    <>
                                        <Zap className="w-4 h-4 animate-pulse" />
                                        {isDocTesting ? "Teste com Documentos" : "Conversa em Tempo Real"}
                                        <span className={clsx(
                                            "ml-2 px-2 py-0.5 text-[10px] rounded-full animate-pulse",
                                            isDocTesting ? "bg-orange-500/20 text-orange-400" : "bg-green-500/20 text-green-400"
                                        )}>
                                            AO VIVO
                                        </span>
                                    </>
                                ) : selectedDocRun ? (
                                    <>
                                        <BookOpen className="w-4 h-4" />
                                        Teste com Documentos - Score: {selectedDocRun.score || 0}
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
                                {(selectedRun || selectedDocRun) && !isRunning && (
                                    <button onClick={clearSelection} className="text-xs text-gray-400 hover:text-white px-2 py-1 bg-gray-800 rounded">
                                        ✕ Fechar
                                    </button>
                                )}
                                {isRunning && (
                                    <div className="flex items-center gap-2 text-xs text-gray-500">
                                        <div className={clsx("w-2 h-2 rounded-full animate-pulse", isDocTesting ? "bg-orange-500" : "bg-green-500")}></div>
                                        {liveMessages.length} mensagens
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Conteúdo */}
                        <div className="flex-1 overflow-y-auto">
                            {/* Modo ao vivo */}
                            {isRunning && liveMessages.length > 0 && (
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
                                                {msg.role === "evaluator" ? "TESTADOR" : "AGENTE"}
                                            </div>
                                            <div className="text-gray-100 text-sm leading-relaxed">{msg.content}</div>
                                        </motion.div>
                                    ))}
                                </div>
                            )}

                            {/* Visualização de Document Test Run */}
                            {selectedDocRun && !isRunning && (
                                <div className="divide-y divide-gray-800">
                                    {/* CHAT */}
                                    <div>
                                        <button onClick={() => toggleSection("chat")} className="w-full p-3 flex items-center justify-between hover:bg-gray-800/50 transition-colors">
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
                                                ) : liveMessages.map((msg, i) => (
                                                    <div key={i} className={clsx(
                                                        "p-3 rounded-lg max-w-[90%] text-sm",
                                                        msg.role === "evaluator"
                                                            ? "bg-blue-900/50 border border-blue-700/50 ml-0 mr-auto"
                                                            : "bg-purple-900/50 border border-purple-700/50 ml-auto mr-0"
                                                    )}>
                                                        <div className={clsx("text-[10px] font-bold mb-1", msg.role === "evaluator" ? "text-blue-400" : "text-purple-400")}>
                                                            {msg.role === "evaluator" ? "TESTADOR" : "AGENTE"}
                                                        </div>
                                                        <div className="text-gray-200">{msg.content}</div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                    {/* ANÁLISE DE DOCUMENTOS */}
                                    <div>
                                        <button onClick={() => toggleSection("analysis")} className="w-full p-3 flex items-center justify-between hover:bg-gray-800/50 transition-colors">
                                            <span className="text-sm font-bold text-orange-400 flex items-center gap-2">
                                                <BookOpen className="w-4 h-4" />
                                                Análise de Aderência {selectedDocRun.score !== null && `(Score: ${selectedDocRun.score})`}
                                            </span>
                                            {expandedSections.analysis ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
                                        </button>
                                        {expandedSections.analysis && selectedDocRun.evaluation_result && (
                                            <div className="p-3 bg-gray-900/30 max-h-[500px] overflow-y-auto space-y-4">
                                                {/* Score Geral */}
                                                <div className="flex items-center gap-4 p-3 bg-gray-800/50 rounded-lg">
                                                    <div className={clsx(
                                                        "text-4xl font-bold",
                                                        (selectedDocRun.score || 0) >= 80 ? "text-green-400" :
                                                            (selectedDocRun.score || 0) >= 50 ? "text-yellow-400" : "text-red-400"
                                                    )}>
                                                        {selectedDocRun.score || 0}
                                                    </div>
                                                    <div>
                                                        <div className="text-sm text-gray-300">Score Geral de Aderência</div>
                                                        <div className={clsx(
                                                            "text-xs font-bold px-2 py-0.5 rounded-full mt-1 inline-block",
                                                            selectedDocRun.evaluation_result.resumo?.resultado === "CONFORME"
                                                                ? "bg-green-900/50 text-green-400"
                                                                : selectedDocRun.evaluation_result.resumo?.resultado === "PARCIALMENTE CONFORME"
                                                                    ? "bg-yellow-900/50 text-yellow-400"
                                                                    : "bg-red-900/50 text-red-400"
                                                        )}>
                                                            {selectedDocRun.evaluation_result.resumo?.resultado || "N/A"}
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Documentos utilizados */}
                                                {selectedDocRun.evaluation_result.documentos_utilizados && (
                                                    <div className="text-xs text-gray-500">
                                                        Documentos: {selectedDocRun.evaluation_result.documentos_utilizados.join(", ")}
                                                    </div>
                                                )}

                                                {/* Scores por dimensão */}
                                                {selectedDocRun.evaluation_result.scores && (
                                                    <div className="grid grid-cols-2 gap-2">
                                                        {Object.entries(selectedDocRun.evaluation_result.scores).map(([key, value]) => (
                                                            <div key={key} className="p-2 bg-gray-800/30 rounded text-xs">
                                                                <div className="text-gray-500 capitalize">{key.replace(/_/g, " ")}</div>
                                                                <div className={clsx(
                                                                    "text-lg font-bold",
                                                                    (value as number) >= 80 ? "text-green-400" :
                                                                        (value as number) >= 50 ? "text-yellow-400" : "text-red-400"
                                                                )}>
                                                                    {String(value)}
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}

                                                {/* Gaps Críticos */}
                                                {(selectedDocRun.evaluation_result.resumo?.gaps_criticos?.length ?? 0) > 0 && (
                                                    <div>
                                                        <div className="text-xs font-bold text-red-400 mb-1 flex items-center gap-1">
                                                            <AlertTriangle className="w-3 h-3" /> Gaps Críticos
                                                        </div>
                                                        <ul className="text-xs text-gray-300 space-y-1">
                                                            {(selectedDocRun.evaluation_result.resumo?.gaps_criticos ?? []).map((g: string, i: number) => (
                                                                <li key={i} className="p-2 bg-red-900/20 border border-red-800/30 rounded">{g}</li>
                                                            ))}
                                                        </ul>
                                                    </div>
                                                )}

                                                {/* Pontos Fortes */}
                                                {(selectedDocRun.evaluation_result.resumo?.pontos_fortes?.length ?? 0) > 0 && (
                                                    <div>
                                                        <div className="text-xs font-bold text-green-400 mb-1">Pontos Fortes</div>
                                                        <ul className="text-xs text-gray-300 space-y-1">
                                                            {(selectedDocRun.evaluation_result.resumo?.pontos_fortes ?? []).map((p: string, i: number) => (
                                                                <li key={i}>• {p}</li>
                                                            ))}
                                                        </ul>
                                                    </div>
                                                )}

                                                {/* Pontos Fracos */}
                                                {(selectedDocRun.evaluation_result.resumo?.pontos_fracos?.length ?? 0) > 0 && (
                                                    <div>
                                                        <div className="text-xs font-bold text-red-400 mb-1">Pontos Fracos</div>
                                                        <ul className="text-xs text-gray-300 space-y-1">
                                                            {(selectedDocRun.evaluation_result.resumo?.pontos_fracos ?? []).map((p: string, i: number) => (
                                                                <li key={i}>• {p}</li>
                                                            ))}
                                                        </ul>
                                                    </div>
                                                )}

                                                {/* Recomendações para o Prompt */}
                                                {(selectedDocRun.evaluation_result.resumo?.recomendacoes_prompt?.length ?? 0) > 0 && (
                                                    <div>
                                                        <div className="text-xs font-bold text-blue-400 mb-1">Recomendações para o Prompt</div>
                                                        <ul className="text-xs text-gray-300 space-y-1">
                                                            {(selectedDocRun.evaluation_result.resumo?.recomendacoes_prompt ?? []).map((r: string, i: number) => (
                                                                <li key={i} className="p-2 bg-blue-900/20 border border-blue-800/30 rounded">{r}</li>
                                                            ))}
                                                        </ul>
                                                    </div>
                                                )}

                                                {/* Análise detalhada por dimensão */}
                                                {selectedDocRun.evaluation_result.analise && (
                                                    <div className="space-y-3 pt-2 border-t border-gray-800">
                                                        <div className="text-xs font-bold text-gray-400">Análise Detalhada por Dimensão</div>
                                                        {Object.entries(selectedDocRun.evaluation_result.analise).map(([key, analysis]) => (
                                                            <details key={key} className="bg-gray-800/30 rounded-lg">
                                                                <summary className="p-2 text-xs font-bold text-gray-300 cursor-pointer hover:text-white capitalize">
                                                                    {key.replace(/_/g, " ")} — Score: {String(analysis.score ?? "N/A")}
                                                                </summary>
                                                                <div className="p-3 text-xs text-gray-400 space-y-2">
                                                                    {analysis.comentario && <p>{analysis.comentario}</p>}
                                                                    {(analysis.violacoes?.length ?? 0) > 0 && (
                                                                        <div>
                                                                            <div className="text-red-400 font-bold mb-1">Violações:</div>
                                                                            {(analysis.violacoes ?? []).map((v, i: number) => (
                                                                                <div key={i} className="p-2 bg-red-900/10 border border-red-900/30 rounded mb-1">
                                                                                    <div className="text-red-300 font-bold">[{v.severidade}] {v.regra}</div>
                                                                                    <div className="mt-1 text-gray-500">Doc: &quot;{v.trecho_documento}&quot;</div>
                                                                                    <div className="text-gray-500">Agente: &quot;{v.trecho_resposta}&quot;</div>
                                                                                    <div className="mt-1 text-blue-400">Fix: {v.sugestao_correcao}</div>
                                                                                </div>
                                                                            ))}
                                                                        </div>
                                                                    )}
                                                                    {(analysis.comportamentos_ausentes?.length ?? 0) > 0 && (
                                                                        <div>
                                                                            <div className="text-yellow-400 font-bold mb-1">Comportamentos Ausentes:</div>
                                                                            {(analysis.comportamentos_ausentes ?? []).map((b, i: number) => (
                                                                                <div key={i} className="p-2 bg-yellow-900/10 border border-yellow-900/30 rounded mb-1">
                                                                                    <div className="text-yellow-300">[{b.impacto}] {b.comportamento}</div>
                                                                                    <div className="mt-1 text-blue-400">Fix: {b.sugestao_correcao}</div>
                                                                                </div>
                                                                            ))}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </details>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Visualização de run de otimização */}
                            {selectedRun && !isRunning && (
                                <div className="divide-y divide-gray-800">
                                    {/* CHAT */}
                                    <div>
                                        <button onClick={() => toggleSection("chat")} className="w-full p-3 flex items-center justify-between hover:bg-gray-800/50 transition-colors">
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
                                                ) : liveMessages.map((msg, i) => (
                                                    <div key={i} className={clsx(
                                                        "p-3 rounded-lg max-w-[90%] text-sm",
                                                        msg.role === "evaluator"
                                                            ? "bg-blue-900/50 border border-blue-700/50 ml-0 mr-auto"
                                                            : "bg-purple-900/50 border border-purple-700/50 ml-auto mr-0"
                                                    )}>
                                                        <div className={clsx("text-[10px] font-bold mb-1", msg.role === "evaluator" ? "text-blue-400" : "text-purple-400")}>
                                                            {msg.role === "evaluator" ? "TESTADOR" : "AGENTE"}
                                                        </div>
                                                        <div className="text-gray-200">{msg.content}</div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                    {/* PROMPT */}
                                    <div>
                                        <button onClick={() => toggleSection("prompt")} className="w-full p-3 flex items-center justify-between hover:bg-gray-800/50 transition-colors">
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

                                    {/* ANÁLISE DO JUIZ */}
                                    <div>
                                        <button onClick={() => toggleSection("analysis")} className="w-full p-3 flex items-center justify-between hover:bg-gray-800/50 transition-colors">
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
                                                        <div className="flex items-center gap-3 p-3 bg-gray-800/50 rounded-lg">
                                                            <div className={clsx(
                                                                "text-3xl font-bold",
                                                                (selectedRun.score || 0) >= 90 ? "text-green-400" :
                                                                    (selectedRun.score || 0) >= 70 ? "text-yellow-400" : "text-red-400"
                                                            )}>
                                                                {selectedRun.score || 0}
                                                            </div>
                                                            <div className="text-xs text-gray-400">Score Geral</div>
                                                        </div>
                                                        {selectedRun.evaluation_result.scores && (
                                                            <div className="grid grid-cols-2 gap-2">
                                                                {Object.entries(selectedRun.evaluation_result.scores).map(([key, value]) => (
                                                                    <div key={key} className="p-2 bg-gray-800/30 rounded text-xs">
                                                                        <div className="text-gray-500 capitalize">{key.replace(/_/g, " ")}</div>
                                                                        <div className="text-white font-bold">{String(value)}</div>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        )}
                                                        {selectedRun.evaluation_result.resumo && (
                                                            <div className="space-y-2">
                                                                {selectedRun.evaluation_result.resumo.pontos_fortes && (
                                                                    <div>
                                                                        <div className="text-xs font-bold text-green-400 mb-1">Pontos Fortes</div>
                                                                        <ul className="text-xs text-gray-300 space-y-1">
                                                                            {(selectedRun.evaluation_result.resumo?.pontos_fortes ?? []).map((p: string, i: number) => (
                                                                                <li key={i}>• {p}</li>
                                                                            ))}
                                                                        </ul>
                                                                    </div>
                                                                )}
                                                                {selectedRun.evaluation_result.resumo.pontos_fracos && (
                                                                    <div>
                                                                        <div className="text-xs font-bold text-red-400 mb-1">Pontos Fracos</div>
                                                                        <ul className="text-xs text-gray-300 space-y-1">
                                                                            {(selectedRun.evaluation_result.resumo?.pontos_fracos ?? []).map((p: string, i: number) => (
                                                                                <li key={i}>• {p}</li>
                                                                            ))}
                                                                        </ul>
                                                                    </div>
                                                                )}
                                                                {selectedRun.evaluation_result.resumo.recomendacoes && (
                                                                    <div>
                                                                        <div className="text-xs font-bold text-blue-400 mb-1">Recomendações</div>
                                                                        <ul className="text-xs text-gray-300 space-y-1">
                                                                            {(selectedRun.evaluation_result.resumo?.recomendacoes ?? []).map((p: string, i: number) => (
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

                            {/* Estado inicial */}
                            {!selectedRun && !selectedDocRun && !isRunning && (
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

                {/* DIREITA: TABS (Histórico / Documentos) */}
                <div className="col-span-3 glass-card p-0 flex flex-col overflow-hidden">
                    {/* Tabs */}
                    <div className="flex border-b border-gray-800">
                        <button
                            onClick={() => setRightTab("history")}
                            className={clsx(
                                "flex-1 p-3 text-xs font-bold transition-colors",
                                rightTab === "history" ? "bg-gray-900/50 text-blue-400 border-b-2 border-blue-500" : "text-gray-500 hover:text-gray-300"
                            )}
                        >
                            Histórico
                        </button>
                        <button
                            onClick={() => setRightTab("documents")}
                            className={clsx(
                                "flex-1 p-3 text-xs font-bold transition-colors relative",
                                rightTab === "documents" ? "bg-gray-900/50 text-orange-400 border-b-2 border-orange-500" : "text-gray-500 hover:text-gray-300"
                            )}
                        >
                            Documentos
                            {documents.length > 0 && (
                                <span className="ml-1 px-1.5 py-0.5 bg-orange-900/50 text-orange-400 text-[10px] rounded-full">
                                    {documents.length}
                                </span>
                            )}
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto">
                        {/* Tab: Histórico */}
                        {rightTab === "history" && (
                            <div className="p-2 space-y-2">
                                {/* Testes com documentos */}
                                {documentTestRuns.length > 0 && (
                                    <>
                                        <div className="text-[10px] font-bold text-orange-400 px-1 pt-1">TESTES COM DOCUMENTOS</div>
                                        {documentTestRuns.map((run) => (
                                            <div
                                                key={run.id}
                                                onClick={() => selectDocRun(run)}
                                                className={clsx(
                                                    "p-2 rounded transition-colors cursor-pointer border-l-2",
                                                    selectedDocRun?.id === run.id
                                                        ? "bg-orange-900/50 border-l-orange-500"
                                                        : "bg-gray-800/50 hover:bg-gray-800 border-l-transparent hover:border-l-orange-500"
                                                )}
                                            >
                                                <div className="flex justify-between items-center mb-1">
                                                    <span className="text-[10px] font-bold text-orange-400 flex items-center gap-1">
                                                        <BookOpen className="w-3 h-3" /> DOC
                                                    </span>
                                                    <span className={clsx("text-[10px] font-bold px-1.5 py-0.5 rounded",
                                                        (run.score || 0) >= 80 ? "bg-green-900 text-green-300" :
                                                            (run.score || 0) >= 50 ? "bg-yellow-900 text-yellow-300" : "bg-red-900 text-red-300"
                                                    )}>
                                                        {run.score || 0}
                                                    </span>
                                                </div>
                                                <div className="text-[10px] text-gray-500 truncate">
                                                    {run.status === "completed"
                                                        ? `${run.transcript?.length || 0} msgs`
                                                        : run.status === "running" ? "Rodando..." : run.status === "failed" ? "Falhou" : "—"}
                                                </div>
                                                <div className="text-[9px] text-gray-600 mt-0.5">
                                                    {new Date(run.created_at).toLocaleString()}
                                                </div>
                                            </div>
                                        ))}
                                        <div className="border-t border-gray-800 my-1"></div>
                                    </>
                                )}

                                {/* Otimizações */}
                                {runs.length > 0 && (
                                    <div className="text-[10px] font-bold text-blue-400 px-1 pt-1">OTIMIZAÇÕES</div>
                                )}
                                {runs.length === 0 && documentTestRuns.length === 0 && (
                                    <div className="text-gray-600 text-xs text-center py-4">Sem execuções</div>
                                )}
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
                                                ? `${run.transcript?.length || 0} msgs`
                                                : run.status === "running" ? "Rodando..." : run.status === "failed" ? "Falhou" : "—"}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Tab: Documentos */}
                        {rightTab === "documents" && (
                            <div className="p-2 space-y-2">
                                {/* Upload button */}
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept=".pdf,.md,.markdown,.txt"
                                    multiple
                                    onChange={handleFileUpload}
                                    className="hidden"
                                />
                                <button
                                    onClick={() => fileInputRef.current?.click()}
                                    disabled={isUploading}
                                    className={clsx(
                                        "w-full p-3 rounded-lg border-2 border-dashed transition-all text-xs font-bold flex items-center justify-center gap-2",
                                        isUploading
                                            ? "border-gray-700 text-gray-500 cursor-not-allowed"
                                            : "border-gray-700 hover:border-orange-500 text-gray-400 hover:text-orange-400 cursor-pointer"
                                    )}
                                >
                                    {isUploading ? (
                                        <><Loader2 className="w-4 h-4 animate-spin" /> Enviando...</>
                                    ) : (
                                        <><Upload className="w-4 h-4" /> Upload (PDF, MD, TXT)</>
                                    )}
                                </button>

                                {documents.length === 0 ? (
                                    <div className="text-gray-600 text-xs text-center py-6">
                                        <FileText className="w-8 h-8 mx-auto mb-2 text-gray-700" />
                                        Nenhum documento
                                        <br />
                                        <span className="text-gray-700">Faça upload de playbooks, regras ou blueprints</span>
                                    </div>
                                ) : (
                                    documents.map((doc) => (
                                        <div key={doc.id} className="p-2 bg-gray-800/50 rounded-lg group hover:bg-gray-800 transition-colors">
                                            <div className="flex items-start justify-between">
                                                <div className="flex items-center gap-2 min-w-0">
                                                    <FileText className="w-4 h-4 text-orange-400 flex-shrink-0" />
                                                    <div className="min-w-0">
                                                        <div className="text-xs font-bold text-gray-300 truncate">{doc.filename}</div>
                                                        <div className="text-[10px] text-gray-500">
                                                            {doc.file_type.toUpperCase()} - {formatFileSize(doc.file_size_bytes)}
                                                        </div>
                                                    </div>
                                                </div>
                                                <button
                                                    onClick={() => handleDeleteDocument(doc.id, doc.filename)}
                                                    className="p-1 opacity-0 group-hover:opacity-100 hover:bg-red-900/30 rounded text-gray-500 hover:text-red-400 transition-all"
                                                    title="Remover documento"
                                                >
                                                    <Trash2 className="w-3 h-3" />
                                                </button>
                                            </div>
                                            <div className="mt-1 text-[9px] text-gray-600 line-clamp-2 font-mono">
                                                {doc.content_text.substring(0, 120)}...
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </main>
    );
}
