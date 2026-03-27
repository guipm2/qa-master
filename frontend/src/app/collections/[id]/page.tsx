"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
    Play, Square, Terminal, Zap, CheckCircle, ChevronDown, ChevronUp,
    MessageSquare, FileText, Scale, Upload, Trash2, BookOpen, AlertTriangle,
    Loader2, ArrowLeft, Info, Brain, Sparkles
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import clsx from "clsx";

const API = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

/* ───── types ───── */
interface Collection { id: string; name: string; base_subject_instruction: string; openai_api_key: string; subject_model?: string; }
interface Msg { role: string; content: string; }
interface RuleViolation { severidade?: string; regra?: string; trecho_documento?: string; trecho_resposta?: string; sugestao_correcao?: string; }
interface MissingBehavior { impacto?: string; comportamento?: string; sugestao_correcao?: string; }
interface AnalysisItem { score?: number; comentario?: string; violacoes?: RuleViolation[]; comportamentos_ausentes?: MissingBehavior[]; }
interface EvalSummary { resultado?: string; gaps_criticos?: string[]; pontos_fortes?: string[]; pontos_fracos?: string[]; recomendacoes_prompt?: string[]; recomendacoes?: string[]; }
interface EvalData { documentos_utilizados?: string[]; scores?: Record<string, unknown>; analise?: Record<string, AnalysisItem>; resumo?: EvalSummary; }
interface TestRun { id: string; iteration: number; status: string; score: number; subject_instruction: string; evaluation_result: EvalData | null; transcript: Msg[]; created_at?: string; error_message?: string; failed_at_stage?: string; }
interface RefDoc { id: string; collection_id: string; filename: string; file_type: string; content_text: string; file_size_bytes: number; created_at: string; }
interface DocTestRun { id: string; collection_id: string; status: string; subject_instruction: string; document_ids: string[]; transcript: Msg[]; evaluation_result: EvalData | null; score: number; created_at: string; error_message?: string; failed_at_stage?: string; }
interface Progress { stage: string; stage_label: string; iteration: number; max_iterations: number; turn: number; max_turns: number; percent: number; }
type SSE = { type: string; [k: string]: unknown };
type Tab = "history" | "documents";
type AnyRun = (TestRun | DocTestRun) & { _kind: "standard" | "document" };

/* ───── helpers ───── */
const errMsg = (e: unknown) => e instanceof Error ? e.message : "Erro desconhecido";
const fmtSize = (b: number) => b < 1024 ? `${b}B` : b < 1048576 ? `${(b / 1024).toFixed(1)}KB` : `${(b / 1048576).toFixed(1)}MB`;
const scoreColor = (s: number, hi = 90) => s >= hi ? "text-green-400" : s >= 60 ? "text-yellow-400" : "text-red-400";
const scoreBg = (s: number, hi = 90) => s >= hi ? "bg-green-900 text-green-300" : s >= 60 ? "bg-yellow-900 text-yellow-300" : "bg-red-900 text-red-300";

export default function CollectionPage() {
    const { id } = useParams();
    const router = useRouter();

    /* data */
    const [collection, setCollection] = useState<Collection | null>(null);
    const [runs, setRuns] = useState<TestRun[]>([]);
    const [documents, setDocuments] = useState<RefDoc[]>([]);
    const [docRuns, setDocRuns] = useState<DocTestRun[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    /* runtime */
    const [isRunning, setIsRunning] = useState(false);
    const [runMode, setRunMode] = useState<"standard" | "document" | null>(null);
    const [currentPrompt, setCurrentPrompt] = useState("");
    const [logs, setLogs] = useState<string[]>([]);
    const [live, setLive] = useState<Msg[]>([]);
    const [iteration, setIteration] = useState(0);
    const [progress, setProgress] = useState<Progress | null>(null);

    /* selection */
    const [selected, setSelected] = useState<AnyRun | null>(null);

    /* ui */
    const [tab, setTab] = useState<Tab>("history");
    const [sections, setSections] = useState({ chat: true, prompt: false, analysis: false });
    const [uploading, setUploading] = useState(false);
    const [stopping, setStopping] = useState(false);
    const fileRef = useRef<HTMLInputElement>(null);
    const logsRef = useRef<HTMLDivElement>(null);
    const chatRef = useRef<HTMLDivElement>(null);
    const abortRef = useRef<AbortController | null>(null);

    const toggle = (s: keyof typeof sections) => setSections(p => ({ ...p, [s]: !p[s] }));

    /* scroll helpers */
    useEffect(() => { logsRef.current && (logsRef.current.scrollTop = logsRef.current.scrollHeight); }, [logs]);
    useEffect(() => { chatRef.current && (chatRef.current.scrollTop = chatRef.current.scrollHeight); }, [live]);

    /* fetch */
    const fetchData = useCallback(async () => {
        try {
            const [c, r, d, dr] = await Promise.all([
                fetch(`${API}/api/collections/${id}`).then(r => r.json()),
                fetch(`${API}/api/collections/${id}/runs`).then(r => r.json()),
                fetch(`${API}/api/collections/${id}/documents`).then(r => r.json()),
                fetch(`${API}/api/collections/${id}/document-test-runs`).then(r => r.json()),
            ]);
            setCollection(c); setRuns(r); setDocuments(d); setDocRuns(dr);
            if (r.length > 0) { setCurrentPrompt(r[r.length - 1].subject_instruction); setIteration(r.length); }
            else setCurrentPrompt(c.base_subject_instruction);
        } catch (e) { console.error(e); } finally { setIsLoading(false); }
    }, [id]);

    useEffect(() => { if (id) fetchData(); }, [id, fetchData]);

    /* logs */
    const log = (msg: string, type = "info") => setLogs(p => [...p, `[${new Date().toLocaleTimeString()}] [${type.toUpperCase()}] ${msg}`]);

    /* SSE */
    const processSSE = async (body: ReadableStream, handler: (e: SSE) => void) => {
        const reader = body.getReader(); const dec = new TextDecoder(); let buf = "";
        while (true) {
            const { done, value } = await reader.read(); if (done) break;
            buf += dec.decode(value, { stream: true });
            const parts = buf.split("\n\n"); buf = parts.pop() || "";
            for (const p of parts) { if (p.startsWith("data: ")) try { const j = JSON.parse(p.slice(6)); if (j?.type) handler(j); } catch {} }
        }
    };

    /* unified handler */
    const handleSSE = (e: SSE) => {
        switch (e.type) {
            case "mode": setRunMode(String(e.mode) as "standard" | "document"); log(String(e.mode) === "document" ? `Modo Documental: ${e.document_count} doc(s)` : "Modo Padrao", "system"); break;
            case "status": log(String(e.content ?? ""), "info"); break;
            case "iteration_start": setIteration(Number(e.iteration ?? 0)); setCurrentPrompt(String(e.prompt ?? "")); setLive([]); log(`>>> ITERACAO ${e.iteration} <<<`, "system"); break;
            case "message": setLive(p => [...p, { role: String(e.role ?? ""), content: String(e.content ?? "") }]); break;
            case "result": log(`Score: ${e.score}/100`, Number(e.score ?? 0) >= 80 ? "success" : "warning"); break;
            case "optimization": log("Prompt otimizado", "system"); setCurrentPrompt(String(e.new_prompt ?? "")); break;
            case "progress": setProgress(e as unknown as Progress); break;
            case "error": {
                const stageLabel = e.failed_at_stage_label ? ` [etapa: ${e.failed_at_stage_label}]` : "";
                const msgCount = e.partial_messages ? ` (${e.partial_messages} msgs coletadas)` : "";
                log(`ERRO${stageLabel}: ${e.content}${msgCount}`, "error");
                break;
            }
            case "done": log(`Concluido: ${e.reason}`, "success"); setIsRunning(false); setProgress(null); break;
        }
    };

    /* Subscribe to SSE events stream (reconnectable) */
    const connectToEvents = useCallback(async () => {
        const controller = new AbortController();
        abortRef.current = controller;
        setIsRunning(true); setStopping(false);
        try {
            const res = await fetch(`${API}/api/collections/${id}/events`, { signal: controller.signal });
            if (!res.ok || !res.body) return;
            await processSSE(res.body, handleSSE);
        } catch (e: unknown) {
            if (!(e instanceof DOMException && e.name === "AbortError")) {
                log(`Erro na conexao: ${errMsg(e)}`, "error");
            }
        } finally {
            setIsRunning(false); setStopping(false); abortRef.current = null;
            fetchData();
        }
    }, [id]);

    /* On mount: check if a test is already running and reconnect */
    useEffect(() => {
        const checkRunning = async () => {
            try {
                const res = await fetch(`${API}/api/collections/${id}/test-status`);
                const data = await res.json();
                if (data.status === "running") {
                    log("Teste em andamento detectado — reconectando...", "system");
                    connectToEvents();
                }
            } catch {}
        };
        checkRunning();
        return () => { abortRef.current?.abort(); };
    }, [id, connectToEvents]);

    /* START: POST to launch background task, then connect to events */
    const startTest = async () => {
        if (isRunning) return;
        setLive([]); setSelected(null); setRunMode(null); setLogs([]); setProgress(null);
        log("Iniciando teste...", "info");
        try {
            const res = await fetch(`${API}/api/collections/${id}/run-smart`, { method: "POST" });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                log(`Erro: ${err.detail || `HTTP ${res.status}`}`, "error");
                return;
            }
            // Agora conecta ao stream de eventos
            connectToEvents();
        } catch (e: unknown) {
            log(`Erro: ${errMsg(e)}`, "error");
        }
    };

    /* STOP */
    const stopTest = async () => {
        if (!isRunning || stopping) return;
        setStopping(true);
        log("Solicitando parada...", "warning");
        try { await fetch(`${API}/api/collections/${id}/stop`, { method: "POST" }); } catch {}
    };

    /* upload */
    const upload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files; if (!files?.length) return;
        setUploading(true);
        for (const f of Array.from(files)) {
            const fd = new FormData(); fd.append("file", f);
            try {
                const r = await fetch(`${API}/api/collections/${id}/documents`, { method: "POST", body: fd });
                r.ok ? log(`"${f.name}" enviado`, "success") : log(`Erro em "${f.name}": ${(await r.json().catch(() => ({}))).detail}`, "error");
            } catch (err: unknown) { log(`Erro em "${f.name}": ${errMsg(err)}`, "error"); }
        }
        setUploading(false); if (fileRef.current) fileRef.current.value = ""; fetchData();
    };

    const deleteDoc = async (docId: string, name: string) => {
        if (!confirm(`Remover "${name}"?`)) return;
        try { await fetch(`${API}/api/documents/${docId}`, { method: "DELETE" }); setDocuments(p => p.filter(d => d.id !== docId)); log(`"${name}" removido`, "info"); }
        catch (err: unknown) { log(errMsg(err), "error"); }
    };

    const deleteRun = async (runId: string, kind: "standard" | "document", e: React.MouseEvent) => {
        e.stopPropagation();
        if (!confirm("Remover este teste? Essa acao nao pode ser desfeita.")) return;
        const endpoint = kind === "document" ? `${API}/api/document-test-runs/${runId}` : `${API}/api/test-runs/${runId}`;
        try {
            const res = await fetch(endpoint, { method: "DELETE" });
            if (!res.ok) { log("Erro ao remover teste", "error"); return; }
            if (kind === "document") setDocRuns(p => p.filter(r => r.id !== runId));
            else setRuns(p => p.filter(r => r.id !== runId));
            if (selected?.id === runId) { setSelected(null); setLive([]); }
            log("Teste removido", "info");
        } catch (err: unknown) { log(errMsg(err), "error"); }
    };

    /* select */
    const selectStd = (r: TestRun) => { setSelected({ ...r, _kind: "standard" }); setLive(r.transcript?.length ? r.transcript : []); setCurrentPrompt(r.subject_instruction || ""); };
    const selectDoc = (r: DocTestRun) => { setSelected({ ...r, _kind: "document" }); setLive(r.transcript?.length ? r.transcript : []); setCurrentPrompt(r.subject_instruction || ""); };
    const clearSel = () => { setSelected(null); setLive([]); if (runs.length) { setCurrentPrompt(runs[runs.length - 1].subject_instruction); setIteration(runs.length); } };

    const bestScore = Math.max(0, ...runs.map(r => r.score ?? 0), ...docRuns.map(r => r.score ?? 0));
    const isDoc = selected?._kind === "document";
    const evalResult = selected?.evaluation_result;

    if (isLoading || !collection) return (
        <main className="min-h-screen bg-black flex items-center justify-center">
            <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
        </main>
    );

    return (
        <main className="min-h-screen bg-black text-white flex flex-col h-screen overflow-hidden">
            {/* ══════ HEADER ══════ */}
            <header className="px-4 sm:px-6 py-4 border-b border-gray-800 flex flex-col sm:flex-row justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                    <Link href="/" className="p-2 -ml-2 hover:bg-gray-800 rounded-lg transition-colors shrink-0" aria-label="Voltar">
                        <ArrowLeft className="w-5 h-5 text-gray-400" />
                    </Link>
                    <div className="min-w-0">
                        <h1 className="text-lg sm:text-xl font-bold truncate">{collection.name}</h1>
                        <div className="flex items-center gap-3 text-xs text-gray-500">
                            <span className="font-mono">{collection.subject_model || "gpt-5.2"}</span>
                            {documents.length > 0 && (
                                <span className="flex items-center gap-1 text-orange-400">
                                    <BookOpen className="w-3 h-3" /> {documents.length} doc(s)
                                </span>
                            )}
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right hidden sm:block">
                        <div className="text-[10px] text-gray-500 uppercase tracking-wider">Melhor Score</div>
                        <div className={clsx("text-xl font-bold", scoreColor(bestScore))}>{bestScore}</div>
                    </div>

                    {isRunning ? (
                        <button
                            onClick={stopTest}
                            disabled={stopping}
                            className={clsx(
                                "px-5 py-2.5 rounded-lg font-bold flex items-center gap-2 transition-all text-sm",
                                stopping
                                    ? "bg-gray-800 text-gray-400 cursor-not-allowed"
                                    : "bg-red-600 hover:bg-red-500 text-white hover:scale-105"
                            )}
                        >
                            {stopping ? <Loader2 className="w-4 h-4 animate-spin" /> : <Square className="w-4 h-4" />}
                            {stopping ? "Parando..." : "Parar Teste"}
                        </button>
                    ) : (
                        <button
                            onClick={startTest}
                            className="px-5 py-2.5 rounded-lg font-bold flex items-center gap-2 transition-all text-sm bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white hover:scale-105"
                        >
                            <Play className="w-4 h-4" /> Iniciar Teste
                        </button>
                    )}
                </div>
            </header>

            {/* ══════ MODE INDICATOR ══════ */}
            <AnimatePresence>
                {isRunning && runMode && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className={clsx(
                            "px-4 sm:px-6 py-2 text-xs font-medium flex items-center gap-2 border-b",
                            runMode === "document"
                                ? "bg-orange-950/40 text-orange-400 border-orange-900/50"
                                : "bg-blue-950/40 text-blue-400 border-blue-900/50"
                        )}
                    >
                        {runMode === "document" ? <BookOpen className="w-3.5 h-3.5" /> : <Scale className="w-3.5 h-3.5" />}
                        {runMode === "document" ? "Modo Documental — avaliando com base nos documentos de referencia" : "Modo Padrao — avaliando qualidade geral"}
                        <span className="ml-auto px-2 py-0.5 rounded-full bg-white/10 text-[10px] animate-pulse">AO VIVO</span>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ══════ PROGRESS BAR ══════ */}
            <AnimatePresence>
                {isRunning && progress && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="px-4 sm:px-6 py-3 border-b border-gray-800 bg-gray-950/60"
                    >
                        {/* stage indicators */}
                        <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-3">
                                {[
                                    { key: "conversation", label: "Conversa", icon: <MessageSquare className="w-3 h-3" /> },
                                    { key: "evaluation", label: "Avaliação", icon: <Brain className="w-3 h-3" /> },
                                    { key: "optimization", label: "Otimização", icon: <Sparkles className="w-3 h-3" /> },
                                ].map((st, i) => {
                                    const stageOrder = ["conversation", "evaluation", "optimization"];
                                    const currentIdx = stageOrder.indexOf(progress.stage);
                                    const thisIdx = i;
                                    const isActive = thisIdx === currentIdx;
                                    const isDone = thisIdx < currentIdx;
                                    return (
                                        <React.Fragment key={st.key}>
                                            {i > 0 && <div className={clsx("w-6 h-px", isDone ? "bg-blue-500" : "bg-gray-700")} />}
                                            <div className={clsx(
                                                "flex items-center gap-1.5 text-[10px] font-bold px-2 py-1 rounded-full transition-all duration-300",
                                                isActive ? "bg-blue-500/20 text-blue-400 ring-1 ring-blue-500/40" :
                                                isDone ? "bg-green-500/10 text-green-500" : "text-gray-600"
                                            )}>
                                                {isDone ? <CheckCircle className="w-3 h-3" /> : isActive ? <span className="relative flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" /><span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500" /></span> : st.icon}
                                                <span className="hidden sm:inline">{st.label}</span>
                                            </div>
                                        </React.Fragment>
                                    );
                                })}
                            </div>
                            <div className="text-[10px] text-gray-500 font-mono">
                                Iteração {progress.iteration}/{progress.max_iterations} — {Math.round(progress.percent)}%
                            </div>
                        </div>

                        {/* bar */}
                        <div className="relative w-full h-1.5 bg-gray-800 rounded-full overflow-hidden">
                            <motion.div
                                className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-blue-600 via-blue-500 to-purple-500"
                                initial={{ width: 0 }}
                                animate={{ width: `${progress.percent}%` }}
                                transition={{ duration: 0.5, ease: "easeOut" }}
                            />
                            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent animate-pulse" />
                        </div>

                        {/* label */}
                        <div className="mt-1.5 text-[10px] text-gray-500">
                            {progress.stage_label}
                            {progress.stage === "conversation" && progress.max_turns > 0 && (
                                <span className="text-gray-600 ml-1">({progress.turn}/{progress.max_turns} mensagens)</span>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ══════ GRID ══════ */}
            <div className="flex-1 grid grid-cols-12 gap-3 p-3 sm:p-4 overflow-hidden">

                {/* ── LEFT: CONSOLE ── */}
                <div className="col-span-12 lg:col-span-3 flex flex-col gap-3 overflow-hidden order-3 lg:order-1">
                    {/* mini chart */}
                    {runs.length > 0 && (
                        <div className="glass-card p-2 h-20 flex items-end gap-0.5 overflow-x-auto shrink-0">
                            {runs.map(r => (
                                <motion.div key={r.id} initial={{ height: 0 }} animate={{ height: `${Math.max(r.score || 0, 5)}%` }}
                                    onClick={() => selectStd(r)}
                                    className={clsx("w-3 rounded-t cursor-pointer hover:opacity-80 shrink-0 relative group",
                                        selected?.id === r.id ? "ring-2 ring-white" : "",
                                        (r.score || 0) >= 90 ? "bg-green-500" : (r.score || 0) >= 60 ? "bg-yellow-500" : "bg-red-500"
                                    )}>
                                    <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 text-[9px] font-bold opacity-0 group-hover:opacity-100 transition-opacity">{r.score || 0}</div>
                                </motion.div>
                            ))}
                        </div>
                    )}

                    {/* console */}
                    <div className="flex-1 flex flex-col overflow-hidden bg-black border border-gray-800 rounded-xl min-h-[200px]">
                        <div className="bg-gray-900/80 px-3 py-2 text-[10px] font-mono text-gray-500 flex items-center gap-2 border-b border-gray-800">
                            <Terminal className="w-3 h-3" /> Console
                        </div>
                        <div ref={logsRef} className="flex-1 overflow-y-auto p-2 space-y-0.5 font-mono text-[10px] leading-relaxed">
                            {logs.length === 0 && <span className="text-gray-700">Aguardando...</span>}
                            {logs.map((l, i) => (
                                <div key={i} className={clsx(
                                    l.includes("[ERROR]") ? "text-red-400" : l.includes("[SUCCESS]") ? "text-green-400" :
                                    l.includes("[SYSTEM]") ? "text-blue-400" : l.includes("[WARNING]") ? "text-yellow-400" : "text-gray-500"
                                )}>{l}</div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* ── CENTER: CHAT + RESULTS ── */}
                <div className="col-span-12 lg:col-span-6 flex flex-col overflow-hidden order-1 lg:order-2">
                    <div className={clsx(
                        "glass-card flex-1 flex flex-col overflow-hidden transition-all duration-300",
                        isRunning && live.length > 0
                            ? runMode === "document"
                                ? "border-2 border-orange-500/40 shadow-lg shadow-orange-500/5"
                                : "border-2 border-blue-500/40 shadow-lg shadow-blue-500/5"
                            : "border border-gray-800"
                    )}>
                        {/* header */}
                        <div className={clsx(
                            "px-4 py-3 border-b flex items-center justify-between",
                            isRunning && live.length ? (runMode === "document" ? "border-orange-500/30 bg-orange-950/20" : "border-blue-500/30 bg-blue-950/20")
                            : selected ? (isDoc ? "border-orange-500/30 bg-orange-950/20" : "border-blue-500/30 bg-blue-950/20")
                            : "border-gray-800 bg-gray-900/30"
                        )}>
                            <h3 className="text-sm font-bold flex items-center gap-2 text-gray-300">
                                {isRunning && live.length ? (
                                    <><Zap className="w-4 h-4 animate-pulse text-yellow-400" /> Conversa ao Vivo <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-500/20 text-green-400 animate-pulse ml-1">LIVE</span></>
                                ) : selected ? (
                                    selected.status === "failed" ? (
                                        <><AlertTriangle className="w-4 h-4 text-red-400" /> Teste Falhou {selected.failed_at_stage && <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 ml-1">na etapa: {selected.failed_at_stage}</span>}</>
                                    ) : (
                                        <>{isDoc ? <BookOpen className="w-4 h-4 text-orange-400" /> : <CheckCircle className="w-4 h-4 text-blue-400" />}
                                        {isDoc ? `Teste Documental — Score: ${(selected as DocTestRun).score || 0}` : `Iteracao ${(selected as TestRun).iteration} — Score: ${(selected as TestRun).score || 0}`}</>
                                    )
                                ) : (
                                    <><Info className="w-4 h-4 text-gray-500" /> {documents.length > 0 ? "Clique em Iniciar Teste para avaliar com documentos" : "Clique em Iniciar Teste para comecar"}</>
                                )}
                            </h3>
                            <div className="flex items-center gap-2">
                                {selected && !isRunning && <button onClick={clearSel} className="text-[10px] text-gray-400 hover:text-white px-2 py-1 bg-gray-800 rounded">Fechar</button>}
                                {isRunning && <span className="text-[10px] text-gray-500">{live.length} msgs</span>}
                            </div>
                        </div>

                        {/* body */}
                        <div className="flex-1 overflow-y-auto">
                            {/* LIVE */}
                            {isRunning && live.length > 0 && (
                                <div ref={chatRef} className="p-4 space-y-3">
                                    {live.map((m, i) => (
                                        <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                                            className={clsx("p-3 rounded-xl max-w-[85%] text-sm",
                                                m.role === "evaluator" ? "bg-blue-900/50 border border-blue-700/40 mr-auto" : "bg-purple-900/50 border border-purple-700/40 ml-auto"
                                            )}>
                                            <div className={clsx("text-[10px] font-bold mb-1.5", m.role === "evaluator" ? "text-blue-300" : "text-purple-300")}>
                                                {m.role === "evaluator" ? "TESTADOR" : "AGENTE"}
                                            </div>
                                            <div className="text-gray-100 leading-relaxed">{m.content}</div>
                                        </motion.div>
                                    ))}
                                </div>
                            )}

                            {/* SELECTED RUN */}
                            {selected && !isRunning && (
                                <div className="divide-y divide-gray-800">
                                    {/* Error Banner */}
                                    {selected.status === "failed" && (
                                        <div className="p-4 bg-red-950/30 border-b border-red-900/40">
                                            <div className="flex items-start gap-3">
                                                <div className="p-2 bg-red-900/40 rounded-lg shrink-0">
                                                    <AlertTriangle className="w-5 h-5 text-red-400" />
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <div className="text-sm font-bold text-red-400 mb-1">Teste falhou{selected.failed_at_stage && ` na etapa de ${
                                                        selected.failed_at_stage === "conversation" ? "Conversa" :
                                                        selected.failed_at_stage === "evaluation" ? "Avaliacao" :
                                                        selected.failed_at_stage === "optimization" ? "Otimizacao" : selected.failed_at_stage
                                                    }`}</div>
                                                    {selected.error_message && (
                                                        <pre className="text-xs text-red-300/80 bg-red-950/40 rounded p-2 mt-2 whitespace-pre-wrap break-all font-mono max-h-32 overflow-y-auto">{selected.error_message}</pre>
                                                    )}
                                                    <div className="flex items-center gap-3 mt-2 text-[10px] text-gray-500">
                                                        {live.length > 0 && <span>{live.length} mensagens coletadas antes da falha</span>}
                                                        {selected.created_at && <span>{new Date(selected.created_at).toLocaleString()}</span>}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* Chat */}
                                    <Section title={selected.status === "failed" ? "Conversa (parcial)" : "Conversa"} icon={<MessageSquare className="w-4 h-4" />} badge={`${live.length} msgs`} color={selected.status === "failed" ? "red" : "blue"} open={sections.chat} toggle={() => toggle("chat")}>
                                        <div className="p-3 space-y-2 max-h-60 overflow-y-auto">
                                            {live.length === 0 ? <Empty text="Sem mensagens" /> : live.map((m, i) => (
                                                <div key={i} className={clsx("p-2.5 rounded-lg text-sm", m.role === "evaluator" ? "bg-blue-900/30 border border-blue-800/30 mr-auto max-w-[90%]" : "bg-purple-900/30 border border-purple-800/30 ml-auto max-w-[90%]")}>
                                                    <div className={clsx("text-[10px] font-bold mb-1", m.role === "evaluator" ? "text-blue-400" : "text-purple-400")}>{m.role === "evaluator" ? "TESTADOR" : "AGENTE"}</div>
                                                    <div className="text-gray-200">{m.content}</div>
                                                </div>
                                            ))}
                                        </div>
                                    </Section>

                                    {/* Prompt */}
                                    <Section title="Prompt Utilizado" icon={<FileText className="w-4 h-4" />} color="green" open={sections.prompt} toggle={() => toggle("prompt")}>
                                        <pre className="p-3 text-xs text-gray-300 whitespace-pre-wrap font-mono max-h-60 overflow-y-auto">{selected.subject_instruction || "N/A"}</pre>
                                    </Section>

                                    {/* Analysis */}
                                    <Section title={`Analise ${evalResult ? `(Score: ${(selected as TestRun).score ?? (selected as DocTestRun).score ?? 0})` : ""}`}
                                        icon={isDoc ? <BookOpen className="w-4 h-4" /> : <Scale className="w-4 h-4" />}
                                        color={isDoc ? "orange" : "yellow"} open={sections.analysis} toggle={() => toggle("analysis")}>
                                        {evalResult ? (
                                            <div className="p-3 space-y-4 max-h-[500px] overflow-y-auto">
                                                {/* score badge */}
                                                <div className="flex items-center gap-4 p-3 bg-gray-800/40 rounded-lg">
                                                    <div className={clsx("text-3xl font-bold", scoreColor((selected as TestRun).score ?? (selected as DocTestRun).score ?? 0, isDoc ? 80 : 90))}>
                                                        {(selected as TestRun).score ?? (selected as DocTestRun).score ?? 0}
                                                    </div>
                                                    <div>
                                                        <div className="text-sm text-gray-300">{isDoc ? "Aderencia Documental" : "Score Geral"}</div>
                                                        {evalResult.resumo?.resultado && (
                                                            <span className={clsx("text-[10px] font-bold px-2 py-0.5 rounded-full mt-1 inline-block",
                                                                evalResult.resumo.resultado === "CONFORME" || evalResult.resumo.resultado === "APROVADO" ? "bg-green-900/50 text-green-400" :
                                                                evalResult.resumo.resultado.includes("PARCIAL") || evalResult.resumo.resultado === "ATENCAO" ? "bg-yellow-900/50 text-yellow-400" : "bg-red-900/50 text-red-400"
                                                            )}>{evalResult.resumo.resultado}</span>
                                                        )}
                                                    </div>
                                                </div>

                                                {evalResult.documentos_utilizados && <div className="text-[10px] text-gray-500">Docs: {evalResult.documentos_utilizados.join(", ")}</div>}

                                                {/* scores grid */}
                                                {evalResult.scores && (
                                                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                                        {Object.entries(evalResult.scores).map(([k, v]) => (
                                                            <div key={k} className="p-2 bg-gray-800/30 rounded">
                                                                <div className="text-[10px] text-gray-500 capitalize truncate">{k.replace(/_/g, " ")}</div>
                                                                <div className={clsx("text-lg font-bold", scoreColor(Number(v), isDoc ? 80 : 90))}>{String(v)}</div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}

                                                {/* gaps criticos */}
                                                {evalResult.resumo?.gaps_criticos && evalResult.resumo.gaps_criticos.length > 0 && (
                                                    <List title="Gaps Criticos" icon={<AlertTriangle className="w-3 h-3" />} color="red" items={evalResult.resumo.gaps_criticos} card />
                                                )}
                                                {evalResult.resumo?.pontos_fortes && evalResult.resumo.pontos_fortes.length > 0 && (
                                                    <List title="Pontos Fortes" color="green" items={evalResult.resumo.pontos_fortes} />
                                                )}
                                                {evalResult.resumo?.pontos_fracos && evalResult.resumo.pontos_fracos.length > 0 && (
                                                    <List title="Pontos Fracos" color="red" items={evalResult.resumo.pontos_fracos} />
                                                )}
                                                {(evalResult.resumo?.recomendacoes_prompt ?? evalResult.resumo?.recomendacoes)?.length ? (
                                                    <List title="Recomendacoes" color="blue" items={evalResult.resumo?.recomendacoes_prompt ?? evalResult.resumo?.recomendacoes ?? []} card />
                                                ) : null}

                                                {/* detailed analysis */}
                                                {evalResult.analise && (
                                                    <div className="space-y-2 pt-2 border-t border-gray-800">
                                                        <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Analise Detalhada</div>
                                                        {Object.entries(evalResult.analise).map(([k, a]) => (
                                                            <details key={k} className="bg-gray-800/20 rounded-lg group">
                                                                <summary className="p-2.5 text-xs font-bold text-gray-300 cursor-pointer hover:text-white capitalize flex justify-between items-center">
                                                                    <span>{k.replace(/_/g, " ")}</span>
                                                                    <span className={clsx("text-[10px] px-1.5 py-0.5 rounded", scoreBg(a.score ?? 0, isDoc ? 80 : 90))}>{a.score ?? "?"}</span>
                                                                </summary>
                                                                <div className="px-3 pb-3 text-xs text-gray-400 space-y-2">
                                                                    {a.comentario && <p>{a.comentario}</p>}
                                                                    {a.violacoes?.map((v, i) => (
                                                                        <div key={i} className="p-2 bg-red-900/10 border border-red-900/20 rounded">
                                                                            <div className="text-red-300 font-bold text-[10px]">[{v.severidade}] {v.regra}</div>
                                                                            {v.trecho_documento && <div className="text-gray-500 mt-1">Doc: &quot;{v.trecho_documento}&quot;</div>}
                                                                            {v.trecho_resposta && <div className="text-gray-500">Agente: &quot;{v.trecho_resposta}&quot;</div>}
                                                                            {v.sugestao_correcao && <div className="text-blue-400 mt-1">Fix: {v.sugestao_correcao}</div>}
                                                                        </div>
                                                                    ))}
                                                                    {a.comportamentos_ausentes?.map((b, i) => (
                                                                        <div key={i} className="p-2 bg-yellow-900/10 border border-yellow-900/20 rounded">
                                                                            <div className="text-yellow-300 text-[10px]">[{b.impacto}] {b.comportamento}</div>
                                                                            {b.sugestao_correcao && <div className="text-blue-400 mt-1">Fix: {b.sugestao_correcao}</div>}
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            </details>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        ) : <Empty text="Analise nao disponivel" />}
                                    </Section>
                                </div>
                            )}

                            {/* idle */}
                            {!selected && !isRunning && (
                                <div className="flex flex-col items-center justify-center h-full p-8 text-center gap-4">
                                    <div className="w-16 h-16 rounded-full bg-gray-800/50 flex items-center justify-center">
                                        {documents.length > 0 ? <BookOpen className="w-7 h-7 text-orange-400" /> : <Play className="w-7 h-7 text-blue-400" />}
                                    </div>
                                    <div>
                                        <p className="text-gray-400 text-sm">
                                            {documents.length > 0
                                                ? `${documents.length} documento(s) detectado(s) — o teste usara o Document Judge`
                                                : "Nenhum documento — o teste usara o Judge padrao"}
                                        </p>
                                        <p className="text-gray-600 text-xs mt-1">Clique em &quot;Iniciar Teste&quot; ou selecione uma execucao no historico</p>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* ── RIGHT: HISTORY + DOCS ── */}
                <div className="col-span-12 lg:col-span-3 flex flex-col overflow-hidden order-2 lg:order-3 glass-card p-0">
                    {/* tabs */}
                    <div className="flex border-b border-gray-800 shrink-0">
                        <TabBtn active={tab === "history"} onClick={() => setTab("history")} color="blue">Historico</TabBtn>
                        <TabBtn active={tab === "documents"} onClick={() => setTab("documents")} color="orange" badge={documents.length || undefined}>Documentos</TabBtn>
                    </div>

                    <div className="flex-1 overflow-y-auto">
                        {tab === "history" && (
                            <div className="p-2 space-y-1.5">
                                {docRuns.length > 0 && (
                                    <>
                                        <div className="text-[9px] font-bold text-orange-400/70 uppercase tracking-wider px-1 pt-1">Testes Documentais</div>
                                        {docRuns.map(r => (
                                            <HistoryCard key={r.id} onClick={() => selectDoc(r)} active={selected?.id === r.id}
                                                label={<><BookOpen className="w-3 h-3" /> DOC</>} labelColor="orange" score={r.score}
                                                failed={r.status === "failed"}
                                                detail={r.status === "completed" ? `${r.transcript?.length || 0} msgs` : r.status === "running" ? "Rodando..." : r.status === "failed" ? `Falhou${r.failed_at_stage ? ` (${r.failed_at_stage})` : ""}` : "--"}
                                                date={r.created_at} scoreThreshold={80}
                                                onDelete={(e) => deleteRun(r.id, "document", e)}
                                            />
                                        ))}
                                        <div className="border-t border-gray-800/50 my-1" />
                                    </>
                                )}
                                {runs.length > 0 && <div className="text-[9px] font-bold text-blue-400/70 uppercase tracking-wider px-1 pt-1">Otimizacoes</div>}
                                {runs.length === 0 && docRuns.length === 0 && <Empty text="Sem execucoes" />}
                                {runs.slice().reverse().map(r => (
                                    <HistoryCard key={r.id} onClick={() => selectStd(r)} active={selected?.id === r.id}
                                        label={`IT. ${r.iteration}`} labelColor="gray" score={r.score}
                                        failed={r.status === "failed"}
                                        detail={r.status === "completed" ? `${r.transcript?.length || 0} msgs` : r.status === "running" ? "Rodando..." : r.status === "failed" ? `Falhou${r.failed_at_stage ? ` (${r.failed_at_stage})` : ""}` : "--"}
                                        onDelete={(e) => deleteRun(r.id, "standard", e)}
                                    />
                                ))}
                            </div>
                        )}

                        {tab === "documents" && (
                            <div className="p-2 space-y-2">
                                <input ref={fileRef} type="file" accept=".pdf,.md,.markdown,.txt" multiple onChange={upload} className="hidden" />
                                <button onClick={() => fileRef.current?.click()} disabled={uploading}
                                    className="w-full p-3 rounded-lg border-2 border-dashed border-gray-700 hover:border-orange-500 text-gray-400 hover:text-orange-400 text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50">
                                    {uploading ? <><Loader2 className="w-4 h-4 animate-spin" /> Enviando...</> : <><Upload className="w-4 h-4" /> Upload (PDF, MD, TXT)</>}
                                </button>
                                {documents.length === 0 ? (
                                    <div className="text-center py-8">
                                        <FileText className="w-10 h-10 mx-auto text-gray-800 mb-2" />
                                        <p className="text-gray-600 text-xs">Nenhum documento</p>
                                        <p className="text-gray-700 text-[10px] mt-1">Upload playbooks, regras ou blueprints</p>
                                    </div>
                                ) : documents.map(d => (
                                    <div key={d.id} className="p-2.5 bg-gray-800/40 rounded-lg group hover:bg-gray-800/60 transition-colors">
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="flex items-center gap-2 min-w-0">
                                                <FileText className="w-4 h-4 text-orange-400 shrink-0" />
                                                <div className="min-w-0">
                                                    <div className="text-xs font-medium text-gray-300 truncate">{d.filename}</div>
                                                    <div className="text-[10px] text-gray-600">{d.file_type.toUpperCase()} - {fmtSize(d.file_size_bytes)}</div>
                                                </div>
                                            </div>
                                            <button onClick={() => deleteDoc(d.id, d.filename)} className="p-1 opacity-0 group-hover:opacity-100 hover:bg-red-900/30 rounded text-gray-500 hover:text-red-400 transition-all shrink-0" aria-label="Remover">
                                                <Trash2 className="w-3 h-3" />
                                            </button>
                                        </div>
                                        <div className="mt-1.5 text-[9px] text-gray-600 line-clamp-2 font-mono leading-relaxed">{d.content_text.substring(0, 120)}...</div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </main>
    );
}

/* ─── Sub-components ─── */

function Section({ title, icon, badge, color, open, toggle, children }: {
    title: string; icon: React.ReactNode; badge?: string; color: string; open: boolean; toggle: () => void; children: React.ReactNode;
}) {
    const colors: Record<string, string> = { blue: "text-blue-400", green: "text-green-400", yellow: "text-yellow-400", orange: "text-orange-400", red: "text-red-400" };
    return (
        <div>
            <button onClick={toggle} className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-800/30 transition-colors" aria-expanded={open}>
                <span className={clsx("text-xs font-bold flex items-center gap-2", colors[color] ?? "text-gray-400")}>
                    {icon} {title} {badge && <span className="text-[10px] text-gray-500 font-normal">({badge})</span>}
                </span>
                {open ? <ChevronUp className="w-4 h-4 text-gray-600" /> : <ChevronDown className="w-4 h-4 text-gray-600" />}
            </button>
            <AnimatePresence>
                {open && <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">{children}</motion.div>}
            </AnimatePresence>
        </div>
    );
}

function TabBtn({ active, onClick, color, badge, children }: { active: boolean; onClick: () => void; color: string; badge?: number; children: React.ReactNode }) {
    const colors: Record<string, string> = { blue: "text-blue-400 border-blue-500", orange: "text-orange-400 border-orange-500" };
    return (
        <button onClick={onClick} className={clsx("flex-1 px-3 py-2.5 text-[11px] font-bold transition-colors relative", active ? `${colors[color]} border-b-2 bg-gray-900/30` : "text-gray-500 hover:text-gray-300 border-b-2 border-transparent")}>
            {children}
            {badge ? <span className="ml-1.5 px-1.5 py-0.5 bg-orange-900/40 text-orange-400 text-[9px] rounded-full">{badge}</span> : null}
        </button>
    );
}

function HistoryCard({ onClick, active, label, labelColor, score, detail, date, scoreThreshold = 90, failed, onDelete }: {
    onClick: () => void; active: boolean; label: React.ReactNode; labelColor: string; score: number; detail: string; date?: string; scoreThreshold?: number; failed?: boolean; onDelete?: (e: React.MouseEvent) => void;
}) {
    const lc: Record<string, string> = { orange: "text-orange-400", gray: "text-gray-500", blue: "text-blue-400" };
    return (
        <div onClick={onClick} className={clsx("p-2 rounded-lg transition-all cursor-pointer border-l-2 group relative",
            failed ? (active ? "bg-red-900/30 border-l-red-500" : "bg-red-950/20 hover:bg-red-900/20 border-l-red-500/50 hover:border-l-red-500")
            : active ? "bg-blue-900/30 border-l-blue-500" : "bg-gray-800/30 hover:bg-gray-800/50 border-l-transparent hover:border-l-blue-500/50")}>
            <div className="flex justify-between items-center">
                <span className={clsx("text-[10px] font-bold flex items-center gap-1", failed ? "text-red-400" : lc[labelColor] ?? "text-gray-500")}>{failed && <AlertTriangle className="w-3 h-3" />}{label}</span>
                <div className="flex items-center gap-1">
                    {onDelete && (
                        <button onClick={onDelete} className="p-0.5 opacity-0 group-hover:opacity-100 hover:bg-red-900/30 rounded text-gray-600 hover:text-red-400 transition-all" aria-label="Remover">
                            <Trash2 className="w-3 h-3" />
                        </button>
                    )}
                    {failed ? <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-900/50 text-red-400">ERRO</span>
                        : <span className={clsx("text-[10px] font-bold px-1.5 py-0.5 rounded", scoreBg(score, scoreThreshold))}>{score || 0}</span>}
                </div>
            </div>
            <div className={clsx("text-[10px] mt-0.5", failed ? "text-red-400/60" : "text-gray-600")}>{detail}</div>
            {date && <div className="text-[9px] text-gray-700 mt-0.5">{new Date(date).toLocaleString()}</div>}
        </div>
    );
}

function List({ title, icon, color, items, card }: { title: string; icon?: React.ReactNode; color: string; items: string[]; card?: boolean }) {
    const tc: Record<string, string> = { red: "text-red-400", green: "text-green-400", blue: "text-blue-400", yellow: "text-yellow-400" };
    const bg: Record<string, string> = { red: "bg-red-900/10 border-red-900/20", blue: "bg-blue-900/10 border-blue-900/20" };
    return (
        <div>
            <div className={clsx("text-xs font-bold mb-1.5 flex items-center gap-1", tc[color])}>{icon} {title}</div>
            <ul className="space-y-1">
                {items.map((t, i) => card
                    ? <li key={i} className={clsx("p-2 rounded border text-xs text-gray-300", bg[color] ?? "bg-gray-800/30 border-gray-700/30")}>{t}</li>
                    : <li key={i} className="text-xs text-gray-400">&#x2022; {t}</li>
                )}
            </ul>
        </div>
    );
}

function Empty({ text }: { text: string }) {
    return <div className="text-gray-600 text-xs text-center py-6">{text}</div>;
}
