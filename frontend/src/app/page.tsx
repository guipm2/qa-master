"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { Plus, Layers, Calendar, ArrowRight, Search, Trash2, Edit, Send } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

interface Collection {
  id: string;
  name: string;
  description: string;
  created_at: string;
  openai_api_key?: string;
  base_subject_instruction?: string;
  base_evaluator_instruction?: string;
  max_turns?: number;
  num_personas?: number;
  subject_model?: string;
}

interface CollectionPayload {
  name: string;
  description: string;
  base_subject_instruction: string;
  base_evaluator_instruction: string;
  max_turns: number;
  num_personas: number;
  subject_model: string;
  openai_api_key?: string;
}

export default function DashboardPage() {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form State
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [subjectPrompt, setSubjectPrompt] = useState("Você é um assistente de IA. Seja útil.");
  const [evaluatorPrompt, setEvaluatorPrompt] = useState("");
  const [maxTurns, setMaxTurns] = useState(20);
  const [numPersonas, setNumPersonas] = useState(5);
  const [subjectModel, setSubjectModel] = useState("gpt-5.2");
  const [availableModels, setAvailableModels] = useState<string[]>([]);

  useEffect(() => {
    fetchCollections();
    fetchModels();
  }, []);

  const fetchModels = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/models`);
      const data = await res.json();
      setAvailableModels(data.models || []);
    } catch (err) {
      console.error("Erro ao buscar modelos:", err);
      // Fallback para lista padrão
      setAvailableModels(["gpt-4.1", "gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-4", "gpt-3.5-turbo"]);
    }
  };

  const fetchCollections = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/collections`);
      const data = await res.json();
      setCollections(data);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!newName) return alert("Nome é obrigatório");
    if (!editingId && !apiKey) return alert("API Key é obrigatória para novas coleções");

    const payload: CollectionPayload = {
      name: newName,
      description: newDesc,
      base_subject_instruction: subjectPrompt,
      base_evaluator_instruction: evaluatorPrompt,
      max_turns: maxTurns,
      num_personas: numPersonas,
      subject_model: subjectModel
    };

    if (apiKey) payload.openai_api_key = apiKey;

    try {
      const url = editingId
        ? `${API_BASE_URL}/api/collections/${editingId}`
        : `${API_BASE_URL}/api/collections`;

      const method = editingId ? "PUT" : "POST";

      const res = await fetch(url, {
        method: method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        setShowModal(false);
        fetchCollections();
        resetForm();
      } else {
        alert("Erro ao salvar");
      }
    } catch (e) {
      console.error(e);
      alert("Ocorreu um erro, verifique o console para mais informações.");
    }
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.preventDefault(); // Prevent navigation
    if (!confirm("Tem certeza que deseja excluir esta coleção? O histórico será perdido.")) return;

    try {
      const res = await fetch(`${API_BASE_URL}/api/collections/${id}`, {
        method: "DELETE"
      });
      if (res.ok) {
        setCollections(prev => prev.filter(c => c.id !== id));
      } else {
        alert("Erro ao excluir");
      }
    } catch (e) {
      console.error(e);
      alert("Ocorreu um erro, verifique o console para mais informações.");
    }
  };

  const openEdit = (e: React.MouseEvent, col: Collection) => {
    e.preventDefault();
    setEditingId(col.id);
    setNewName(col.name);
    setNewDesc(col.description || "");
    setApiKey(""); // Don't show existing key for security, only update if needed
    setSubjectPrompt(col.base_subject_instruction || "");
    setEvaluatorPrompt(col.base_evaluator_instruction || "");
    setMaxTurns(col.max_turns || 20);
    setNumPersonas(col.num_personas || 5);
    setSubjectModel(col.subject_model || "gpt-4o");
    setShowModal(true);
  };

  const openNew = () => {
    resetForm();
    setShowModal(true);
  }

  const resetForm = () => {
    setEditingId(null);
    setNewName("");
    setNewDesc("");
    setApiKey("");
    setSubjectPrompt("Você é um assistente de IA. Seja útil.");
    setEvaluatorPrompt("");
    setMaxTurns(20);
    setNumPersonas(5);
    setSubjectModel("gpt-5.2");
  };

  const filteredCollections = collections.filter(c =>
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.description?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <main className="min-h-screen bg-black text-white px-4 sm:px-6 lg:px-8 py-6 sm:py-8 flex flex-col items-center">
      <header className="w-full max-w-6xl mb-8 sm:mb-12 space-y-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-3xl sm:text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-600">
              QA Master
            </h1>
            <p className="text-gray-500 text-sm mt-1">Dashboard de Otimizacao de Prompts</p>
          </div>
          <div className="flex gap-2 sm:gap-3">
            <Link href="/webhook" className="bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white px-4 py-2.5 rounded-lg text-sm font-medium flex items-center gap-2 transition-all whitespace-nowrap">
              <Send className="w-4 h-4" /> Webhook
            </Link>
            <button onClick={openNew} className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white px-5 py-2.5 rounded-lg text-sm font-medium flex items-center gap-2 transition-all hover:scale-105 whitespace-nowrap">
              <Plus className="w-4 h-4" /> Nova Colecao
            </button>
          </div>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600" />
          <input type="text" placeholder="Buscar colecoes..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
            className="w-full bg-gray-900/50 border border-gray-800 rounded-xl pl-10 pr-4 py-3 text-sm focus:border-blue-500/50 focus:outline-none transition-colors placeholder-gray-600" />
        </div>
      </header>

      <div className="w-full max-w-6xl grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
        {isLoading ? (
          <p className="text-gray-500 col-span-full text-center py-20">Carregando...</p>
        ) : filteredCollections.length === 0 ? (
          <div className="col-span-full py-20 text-center border border-dashed border-gray-800 rounded-2xl">
            <Layers className="w-14 h-14 mx-auto text-gray-800 mb-3" />
            <p className="text-gray-500">Nenhuma colecao encontrada</p>
            <button onClick={openNew} className="mt-3 text-sm text-blue-400 hover:text-blue-300">Criar a primeira</button>
          </div>
        ) : (
          filteredCollections.map((col) => (
            <Link href={`/collections/${col.id}`} key={col.id}>
              <motion.div whileHover={{ y: -4 }}
                className="glass-card p-5 h-full flex flex-col justify-between group cursor-pointer border border-gray-800 hover:border-blue-500/40 transition-all relative">
                <div>
                  <div className="flex justify-between items-start mb-3">
                    <div className="bg-blue-900/20 p-2.5 rounded-lg text-blue-400">
                      <Layers className="w-5 h-5" />
                    </div>
                    <div className="flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={(e) => openEdit(e, col)} className="p-1.5 hover:bg-gray-800 rounded text-gray-500 hover:text-white" title="Editar" aria-label="Editar">
                        <Edit className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={(e) => handleDelete(e, col.id)} className="p-1.5 hover:bg-red-900/30 rounded text-gray-500 hover:text-red-400" title="Excluir" aria-label="Excluir">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <h3 className="text-lg font-bold text-gray-100 mb-1 group-hover:text-blue-400 transition-colors truncate">{col.name}</h3>
                  <p className="text-sm text-gray-500 line-clamp-2">{col.description || "Sem descricao"}</p>
                </div>
                <div className="mt-4 flex items-center justify-between border-t border-gray-800/50 pt-3">
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] text-gray-600 flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {new Date(col.created_at).toLocaleDateString()}
                    </span>
                    <span className="text-[10px] font-mono text-purple-400/70 bg-purple-900/10 px-1.5 py-0.5 rounded">
                      {col.subject_model || "gpt-5.2"}
                    </span>
                  </div>
                  <ArrowRight className="w-4 h-4 text-gray-600 group-hover:text-blue-400 transition-colors" />
                </div>
              </motion.div>
            </Link>
          ))
        )}
      </div>

      {/* MODAL (CREATE / EDIT) */}
      <AnimatePresence>
        {showModal && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl"
            >
              <div className="p-6 border-b border-gray-800 flex justify-between items-center">
                <h2 className="text-xl font-bold">{editingId ? "Editar Coleção" : "Nova Coleção"}</h2>
                <button onClick={() => setShowModal(false)}><span className="text-gray-500 hover:text-white">✕</span></button>
              </div>

              <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <label className="block text-sm text-gray-400 mb-1">Nome da Coleção</label>
                    <input value={newName} onChange={e => setNewName(e.target.value)} className="w-full bg-black border border-gray-700 rounded p-2 focus:border-blue-500 focus:outline-none" placeholder="Ex: Chatbot Atendimento V1" />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-sm text-gray-400 mb-1">Descrição</label>
                    <input value={newDesc} onChange={e => setNewDesc(e.target.value)} className="w-full bg-black border border-gray-700 rounded p-2 focus:border-blue-500 focus:outline-none" placeholder="Objetivo deste fluxo de testes..." />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-sm text-gray-400 mb-1">
                      OpenAI API Key {editingId && <span className="text-xs text-gray-500">(Deixe em branco para manter a atual)</span>}
                    </label>
                    <input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)} className="w-full bg-black border border-gray-700 rounded p-2 focus:border-blue-500 focus:outline-none" />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-sm text-gray-400 mb-1">Modelo do Agente</label>
                    <select
                      value={subjectModel}
                      onChange={e => setSubjectModel(e.target.value)}
                      className="w-full bg-black border border-gray-700 rounded p-2 focus:border-blue-500 focus:outline-none"
                    >
                      {availableModels.map(model => (
                        <option key={model} value={model}>{model}</option>
                      ))}
                    </select>
                    <p className="text-xs text-gray-500 mt-1">Modelo OpenAI que será usado para testar o prompt</p>
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Max Turnos</label>
                    <div className="flex items-center gap-3">
                      <input
                        type="range"
                        value={maxTurns}
                        onChange={e => setMaxTurns(Number(e.target.value))}
                        min={1}
                        max={50}
                        className="flex-1 accent-blue-500"
                      />
                      <span className="text-blue-400 font-bold w-8 text-center">{maxTurns}</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">Quantidade de interações por teste (1-50)</p>
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Nº de Personas</label>
                    <div className="flex items-center gap-3">
                      <input
                        type="range"
                        value={numPersonas}
                        onChange={e => setNumPersonas(Number(e.target.value))}
                        min={1}
                        max={20}
                        className="flex-1 accent-blue-500"
                      />
                      <span className="text-blue-400 font-bold w-8 text-center">{numPersonas}</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">Quantidade de personas para testar (1-20)</p>
                  </div>
                </div>

                <div className="pt-4 border-t border-gray-800">
                  <h3 className="text-sm font-bold text-gray-300 mb-4 uppercase">Configuração Inicial dos Agentes</h3>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm text-gray-400 mb-1">Prompt do Sujeito (Base)</label>
                      <textarea value={subjectPrompt} onChange={e => setSubjectPrompt(e.target.value)} className="w-full h-24 bg-black border border-gray-700 rounded p-2 text-sm focus:border-blue-500 focus:outline-none" />
                    </div>
                    <div>
                      <label className="block text-sm text-gray-400 mb-1">Cenario de Teste do Avaliador</label>
                      <p className="text-[11px] text-gray-600 mb-2">O avaliador ja possui expertise em QA. Use este campo para definir o perfil do usuario simulado e o cenario especifico do teste.</p>
                      <textarea value={evaluatorPrompt} onChange={e => setEvaluatorPrompt(e.target.value)} placeholder="Ex: Simule um cliente irritado que quer cancelar o plano. Seja impaciente e questione os prazos." className="w-full h-24 bg-black border border-gray-700 rounded p-2 text-sm focus:border-blue-500 focus:outline-none" />
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-6 border-t border-gray-800 flex justify-end gap-3 bg-gray-900">
                <button onClick={() => setShowModal(false)} className="px-4 py-2 text-gray-400 hover:text-white">Cancelar</button>
                <button onClick={handleSave} className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded font-medium">
                  {editingId ? "Salvar Alterações" : "Criar Coleção"}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </main>
  );
}
