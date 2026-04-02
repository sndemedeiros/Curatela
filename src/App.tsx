/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useMemo, useEffect } from 'react';
import { 
  Upload, 
  FileText, 
  PieChart, 
  Table as TableIcon, 
  FileJson, 
  Plus, 
  Trash2, 
  AlertCircle, 
  CheckCircle2, 
  Loader2,
  ChevronRight,
  Download,
  Printer,
  PlusCircle,
  X,
  Settings,
  Info,
  FileDown,
  LogOut,
  LogIn,
  Save,
  CloudCheck,
  Copy
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";
import ReactMarkdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import remarkGfm from 'remark-gfm';
import { cn } from './lib/utils';
// @ts-ignore
import html2pdf from 'html2pdf.js';
import { 
  auth, 
  db, 
  googleProvider, 
  signInWithPopup, 
  signOut, 
  onAuthStateChanged, 
  doc, 
  setDoc, 
  onSnapshot,
  User
} from './firebase';

// --- Types ---

interface AccountItem {
  id: string;
  data: string;
  valor: number;
  descricao: string;
  categoria: string;
  tipo: 'receita' | 'despesa';
  estabelecimento?: string;
  origem?: string;
  documentoId?: string;
}

interface ExtractedData {
  items: Omit<AccountItem, 'id'>[];
  saldo_inicial?: number;
  saldo_final?: number;
  inconsistencias?: string[];
}

interface BankAccount {
  id: string;
  banco: string;
  tipo: string;
  agencia: string;
  conta: string;
  saldoInicial: string;
}

interface AppState {
  curador: string;
  curatelado: string;
  mesInicio: string;
  anoInicio: string;
  mesFim: string;
  anoFim: string;
  contasBancarias: BankAccount[];
  saldoInicialCaixa: string;
  items: AccountItem[];
  inconsistencias: string[];
  isProcessing: boolean;
  activeTab: 'dashboard' | 'items' | 'report' | 'config';
}

// --- Gemini Config ---

const GEMINI_MODEL = "gemini-3-flash-preview";

const EXTRACTION_PROMPT = `
Você é um especialista em prestação de contas de curatela. Extraia os dados deste documento (extrato, nota fiscal, recibo, etc.).
Retorne um JSON estritamente no seguinte formato:
{
  "items": [
    {
      "data": "YYYY-MM-DD",
      "valor": 0.00,
      "descricao": "Descrição clara do item",
      "categoria": "Categoria (Alimentação, Saúde, Medicamentos, Transporte, Moradia, Lazer, Outros)",
      "tipo": "receita" ou "despesa",
      "estabelecimento": "Nome do local (se houver)",
      "origem": "Origem do recurso (se houver)"
    }
  ],
  "saldo_inicial": 0.00,
  "saldo_final": 0.00,
  "inconsistencias": ["Lista de problemas encontrados, como ilegibilidade ou valores estranhos"]
}
Regras:
1. Datas devem estar no formato YYYY-MM-DD.
2. Valores devem ser números (float).
3. Se for um extrato bancário, identifique o saldo inicial e final do período mostrado.
4. Se for uma nota fiscal ou recibo, identifique o estabelecimento e a categoria.
5. Seja preciso e não invente dados.
`;

// --- Error Boundary ---

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean, errorInfo: string | null }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, errorInfo: null };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, errorInfo: error instanceof Error ? error.message : String(error) };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
          <div className="bg-white p-8 rounded-3xl shadow-xl max-w-md w-full text-center space-y-4">
            <AlertCircle className="w-12 h-12 text-red-500 mx-auto" />
            <h2 className="text-2xl font-bold text-slate-900">Ops! Algo deu errado.</h2>
            <p className="text-slate-600">Ocorreu um erro inesperado. Por favor, tente recarregar a página.</p>
            {this.state.errorInfo && (
              <pre className="text-xs bg-slate-100 p-4 rounded-lg text-left overflow-auto max-h-40">
                {this.state.errorInfo}
              </pre>
            )}
            <button 
              onClick={() => window.location.reload()}
              className="w-full bg-indigo-600 text-white py-3 rounded-xl font-semibold hover:bg-indigo-700 transition-colors"
            >
              Recarregar Página
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// --- Components ---

export default function App() {
  return (
    <ErrorBoundary>
      <AppContent />
    </ErrorBoundary>
  );
}

function AppContent() {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [loginError, setLoginError] = useState<string | null>(null);

  const [state, setState] = useState<AppState>({
    curador: '',
    curatelado: '',
    mesInicio: '',
    anoInicio: '',
    mesFim: '',
    anoFim: '',
    contasBancarias: [],
    saldoInicialCaixa: '',
    items: [],
    inconsistencias: [],
    isProcessing: false,
    activeTab: 'config',
  });

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setIsAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  // Load Data from Firestore
  useEffect(() => {
    if (!user || !isAuthReady) return;

    const userDocRef = doc(db, 'users', user.uid);
    const unsubscribe = onSnapshot(userDocRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        setState(prev => ({
          ...prev,
          curador: data.curador || '',
          curatelado: data.curatelado || '',
          mesInicio: data.mesInicio || '',
          anoInicio: data.anoInicio || '',
          mesFim: data.mesFim || '',
          anoFim: data.anoFim || '',
          contasBancarias: data.contasBancarias || [],
          saldoInicialCaixa: data.saldoInicialCaixa || '',
          items: data.items || [],
          inconsistencias: data.inconsistencias || [],
        }));
        if (data.updatedAt) {
          setLastSaved(new Date(data.updatedAt));
        }
      }
    }, (error) => {
      handleFirestoreError(error, 'get', `users/${user.uid}`);
    });

    return () => unsubscribe();
  }, [user, isAuthReady]);

  // Save Data to Firestore (Debounced)
  useEffect(() => {
    if (!user || !isAuthReady) return;

    const timeoutId = setTimeout(async () => {
      setIsSaving(true);
      try {
        const userDocRef = doc(db, 'users', user.uid);
        const dataToSave = {
          curador: state.curador,
          curatelado: state.curatelado,
          mesInicio: state.mesInicio,
          anoInicio: state.anoInicio,
          mesFim: state.mesFim,
          anoFim: state.anoFim,
          contasBancarias: state.contasBancarias,
          saldoInicialCaixa: state.saldoInicialCaixa,
          items: state.items,
          inconsistencias: state.inconsistencias,
          updatedAt: new Date().toISOString()
        };
        await setDoc(userDocRef, dataToSave, { merge: true });
        setLastSaved(new Date());
      } catch (error) {
        handleFirestoreError(error, 'write', `users/${user.uid}`);
      } finally {
        setIsSaving(false);
      }
    }, 2000); // Save after 2 seconds of inactivity

    return () => clearTimeout(timeoutId);
  }, [state, user, isAuthReady]);

  const handleFirestoreError = (error: any, operationType: string, path: string) => {
    const errInfo = {
      error: error instanceof Error ? error.message : String(error),
      operationType,
      path,
      authInfo: {
        userId: auth.currentUser?.uid,
        email: auth.currentUser?.email
      }
    };
    console.error('Firestore Error:', JSON.stringify(errInfo));
    // We don't necessarily want to crash the whole app for a save error, 
    // but we should log it and maybe show a toast (omitted for brevity)
  };

  const handleLogin = async () => {
    setLoginError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error: any) {
      console.error("Login Error:", error);
      if (error.code === 'auth/popup-closed-by-user') {
        setLoginError("O login foi cancelado porque a janela foi fechada. Por favor, tente novamente.");
      } else if (error.code === 'auth/blocked-at-project-level') {
        setLoginError("O login está temporariamente bloqueado. Tente novamente mais tarde.");
      } else if (error.code === 'auth/popup-blocked') {
        setLoginError("O navegador bloqueou a janela de login. Por favor, permita pop-ups para este site.");
      } else {
        setLoginError("Ocorreu um erro ao tentar fazer login. Verifique sua conexão e tente novamente.");
      }
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      // Reset state on logout
      setState({
        curador: '',
        curatelado: '',
        mesInicio: '',
        anoInicio: '',
        mesFim: '',
        anoFim: '',
        contasBancarias: [],
        saldoInicialCaixa: '',
        items: [],
        inconsistencias: [],
        isProcessing: false,
        activeTab: 'config',
      });
    } catch (error) {
      console.error("Logout Error:", error);
    }
  };

  const fileInputRef = useRef<HTMLInputElement>(null);
  const reportRef = useRef<HTMLDivElement>(null);

  const totals = useMemo(() => {
    const receitas = state.items
      .filter(i => i.tipo === 'receita')
      .reduce((acc, curr) => acc + curr.valor, 0);
    const despesas = state.items
      .filter(i => i.tipo === 'despesa')
      .reduce((acc, curr) => acc + curr.valor, 0);
    
    // Calculate initial total from bank accounts + caixa
    const initialCaixa = parseFloat(state.saldoInicialCaixa) || 0;
    const totalSaldoInicial = initialCaixa + state.contasBancarias.reduce((acc, curr) => acc + (parseFloat(curr.saldoInicial) || 0), 0); 
    
    return {
      receitas,
      despesas,
      saldoInicial: totalSaldoInicial,
      saldoFinal: totalSaldoInicial + receitas - despesas
    };
  }, [state.items, state.saldoInicialCaixa, state.contasBancarias]);

  const processFiles = async (files: FileList) => {
    setState(prev => ({ ...prev, isProcessing: true }));
    
    // Create a new instance right before making an API call to ensure it uses the latest key
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
    
    try {
      const newItems: AccountItem[] = [];
      let newSaldoInicial = state.saldoInicialCaixa;
      const newInconsistencias = [...state.inconsistencias];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const base64 = await fileToBase64(file);
        
        const response = await ai.models.generateContent({
          model: GEMINI_MODEL,
          contents: [
            {
              parts: [
                { text: EXTRACTION_PROMPT },
                { inlineData: { data: base64.split(',')[1], mimeType: file.type } }
              ]
            }
          ],
          config: {
            responseMimeType: "application/json",
          }
        });

        const resultText = response.text || "{}";
        const extracted: ExtractedData = JSON.parse(resultText);

        if (extracted.items) {
          extracted.items.forEach(item => {
            newItems.push({
              ...item,
              id: Math.random().toString(36).substr(2, 9),
              documentoId: file.name
            });
          });
        }

        if (extracted.saldo_inicial !== undefined && extracted.saldo_inicial !== 0) {
          newSaldoInicial = extracted.saldo_inicial.toString();
        }
        if (extracted.inconsistencias) {
          newInconsistencias.push(...extracted.inconsistencias.map(inc => `[${file.name}] ${inc}`));
        }
      }

      setState(prev => ({
        ...prev,
        items: [...prev.items, ...newItems],
        saldoInicialCaixa: newSaldoInicial || prev.saldoInicialCaixa,
        inconsistencias: Array.from(new Set(newInconsistencias)),
        isProcessing: false
      }));

    } catch (error) {
      console.error("Erro ao processar documentos:", error);
      alert("Erro ao processar um ou mais documentos. Verifique o console.");
      setState(prev => ({ ...prev, isProcessing: false }));
    }
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = error => reject(error);
    });
  };

  const removeItem = (id: string) => {
    setState(prev => ({
      ...prev,
      items: prev.items.filter(item => item.id !== id)
    }));
  };

  const generateReport = () => {
    const receitas = state.items.filter(i => i.tipo === 'receita').sort((a,b) => a.data.localeCompare(b.data));
    const despesas = state.items.filter(i => i.tipo === 'despesa').sort((a,b) => a.data.localeCompare(b.data));
    const dataAtual = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });

    return `
<div style="text-align: center; margin-bottom: 30px;">
  <h1 style="font-size: 24px; font-weight: bold; margin-bottom: 5px; text-transform: uppercase;">Relatório de Prestação de Contas</h1>
  <h2 style="font-size: 18px; font-weight: normal; margin-top: 0;">Processo de Curatela</h2>
</div>

**IDENTIFICAÇÃO:**
- **CURADOR(A):** ${state.curador || '________________________________________________'}
- **CURATELADO(A):** ${state.curatelado || '________________________________________________'}
- **PERÍODO DE REFERÊNCIA:** ${state.mesInicio || '---'}/${state.anoInicio || '---'} até ${state.mesFim || '---'}/${state.anoFim || '---'}

---

### 1. DEMONSTRATIVO DE SALDO INICIAL
Este quadro detalha os valores disponíveis no início do período de referência, compreendendo saldo em espécie (caixa) e em contas bancárias.

| Descrição da Conta / Origem | Valor (R$) |
| :--- | :--- |
| Saldo em Espécie (Caixa) | R$ ${(parseFloat(state.saldoInicialCaixa) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} |
${state.contasBancarias.map(c => `| ${c.banco} (${c.tipo}) - Ag: ${c.agencia} / Cc: ${c.conta} | R$ ${(parseFloat(c.saldoInicial) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} |`).join('\n')}
| **TOTAL DO SALDO INICIAL (A)** | **R$ ${totals.saldoInicial.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}** |

---

### 2. DEMONSTRATIVO DE RECEBIMENTOS (ENTRADAS)
Relação detalhada de todos os valores recebidos em favor do curatelado no período (aposentadoria, benefícios, rendimentos, etc).

| Nº | Data | Descrição do Recebimento | Categoria | Valor (R$) |
| :--- | :--- | :--- | :--- | :--- |
${receitas.map((item, idx) => `| ${(idx + 1).toString().padStart(3, '0')} | ${new Date(item.data).toLocaleDateString('pt-BR')} | ${item.descricao} | ${item.categoria} | R$ ${item.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} |`).join('\n')}
| | | **TOTAL DE RECEBIMENTOS NO MÊS (B)** | | **R$ ${totals.receitas.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}** |

---

### 3. DEMONSTRATIVO DE PAGAMENTOS (SAÍDAS)
Relação detalhada de todas as despesas e pagamentos efetuados para a manutenção e bem-estar do curatelado.

| Nº | Data | Descrição da Despesa | Categoria | Valor (R$) |
| :--- | :--- | :--- | :--- | :--- |
${despesas.map((item, idx) => `| ${(idx + 1).toString().padStart(3, '0')} | ${new Date(item.data).toLocaleDateString('pt-BR')} | ${item.descricao} | ${item.categoria} | R$ ${item.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} |`).join('\n')}
| | | **TOTAL DE PAGAMENTOS NO MÊS (C)** | | **R$ ${totals.despesas.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}** |

---

### 4. RESUMO FINANCEIRO E SALDO FINAL
Apuração do saldo remanescente ao final do período de referência.

| Descrição da Operação | Valor (R$) |
| :--- | :--- |
| (+) Saldo Inicial Total (A) | R$ ${totals.saldoInicial.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} |
| (+) Total de Recebimentos (B) | R$ ${totals.receitas.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} |
| (-) Total de Pagamentos (C) | R$ ${totals.despesas.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} |
| **(=) SALDO FINAL EM CAIXA/CONTAS (D)** | **R$ ${totals.saldoFinal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}** |

---

### 5. DECLARAÇÃO DE VERACIDADE
O(A) Curador(a) abaixo assinado(a) declara, sob as penas da lei, que as informações acima prestadas são a expressão da verdade e que os valores foram integralmente aplicados em benefício exclusivo do curatelado, conforme comprovantes anexos a esta prestação de contas.

<div style="margin-top: 50px; text-align: center;">
  <p>Localidade: __________________________, ${dataAtual}.</p>
  <br><br>
  <p>_________________________________________________________</p>
  <p><strong>${state.curador || 'ASSINATURA DO(A) CURADOR(A)'}</strong></p>
  <p>CPF: __________________________</p>
</div>
    `;
  };

  const downloadPdf = async () => {
    if (!reportRef.current) return;
    
    const element = reportRef.current;
    
    const opt = {
      margin: [10, 10],
      filename: `prestacao-contas-${state.curatelado.replace(/\s+/g, '-').toLowerCase() || 'curatela'}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { 
        scale: 2, 
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
        letterRendering: true,
        logging: false,
        onclone: (clonedDoc: Document) => {
          // Remove oklch colors from the cloned document to prevent html2canvas errors
          const elements = clonedDoc.getElementsByTagName('*');
          for (let i = 0; i < elements.length; i++) {
            const el = elements[i] as HTMLElement;
            const style = window.getComputedStyle(el);
            
            // Check common color properties
            ['color', 'backgroundColor', 'borderColor', 'outlineColor'].forEach(prop => {
              const val = style[prop as any];
              if (val && val.includes('oklch')) {
                el.style[prop as any] = prop === 'backgroundColor' ? '#ffffff' : '#000000';
              }
            });
          }
        }
      },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    try {
      // @ts-ignore
      await html2pdf().set(opt).from(element).save();
    } catch (error) {
      console.error('Erro ao gerar PDF:', error);
      alert('Ocorreu um erro ao gerar o PDF. Verifique se o seu navegador não está bloqueando downloads automáticos.');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 shrink-0">
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-sm shadow-indigo-100">
              <FileText className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">CuratelaAI</h1>
          </div>

          <div className="flex items-center gap-4">
            {user ? (
              <div className="flex items-center gap-3">
                <div className="hidden sm:flex flex-col items-end text-right">
                  <div className="flex items-center gap-2 text-[10px] font-medium text-slate-400">
                    {isSaving ? (
                      <div className="flex items-center gap-1">
                        <Loader2 className="w-2.5 h-2.5 animate-spin" />
                        Salvando...
                      </div>
                    ) : lastSaved ? (
                      <div className="flex items-center gap-1 text-emerald-600">
                        <CloudCheck className="w-2.5 h-2.5" />
                        Salvo
                      </div>
                    ) : null}
                  </div>
                  <p className="text-xs font-bold text-slate-900 leading-none">{user.displayName}</p>
                </div>
                <div className="relative group">
                  <img src={user.photoURL || ''} alt={user.displayName || ''} className="w-9 h-9 rounded-full border-2 border-white shadow-sm ring-1 ring-slate-200 cursor-pointer" />
                  <div className="absolute top-full right-0 mt-2 w-40 bg-white rounded-2xl shadow-xl border border-slate-100 py-2 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
                    <div className="px-4 py-2 border-b border-slate-50 mb-1">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Conta</p>
                      <p className="text-xs font-semibold text-slate-900 truncate">{user.email}</p>
                    </div>
                    <button onClick={handleLogout} className="w-full px-4 py-2 text-left text-xs text-red-500 hover:bg-red-50 flex items-center gap-2 transition-colors">
                      <LogOut className="w-3.5 h-3.5" /> Sair da conta
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-end gap-1">
                <button 
                  onClick={handleLogin}
                  className="flex items-center gap-3 bg-white border border-slate-200 text-slate-700 px-4 py-2 rounded-xl text-sm font-bold hover:bg-slate-50 transition-all shadow-sm hover:shadow-md"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                  Entrar com Google
                </button>
                {loginError && (
                  <p className="text-[10px] font-bold text-red-500 mr-2 animate-pulse">
                    {loginError}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Navigation Tabs */}
        <div className="flex gap-1 bg-slate-200/50 p-1 rounded-xl w-fit mb-8">
          {[
            { id: 'config', label: 'Configurações', icon: Settings },
            { id: 'items', label: 'Lançamentos', icon: TableIcon },
            { id: 'dashboard', label: 'Painel', icon: PieChart },
            { id: 'report', label: 'Relatório Jurídico', icon: FileText },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setState(prev => ({ ...prev, activeTab: tab.id as any }))}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
                state.activeTab === tab.id 
                  ? "bg-white text-indigo-600 shadow-sm" 
                  : "text-slate-500 hover:text-slate-700 hover:bg-white/50"
              )}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>

        <AnimatePresence mode="wait">
          {/* Dashboard Tab */}
          {state.activeTab === 'dashboard' && (
            <motion.div 
              key="dashboard"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-8"
            >
              {/* Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-sm font-medium text-slate-500 uppercase tracking-wider">Saldo Inicial</span>
                    <div className="bg-slate-50 p-2 rounded-lg text-slate-600">
                      <ChevronRight className="w-5 h-5 rotate-90" />
                    </div>
                  </div>
                  <div className="text-3xl font-bold text-slate-700">
                    R$ {totals.saldoInicial.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </div>
                </div>

                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-sm font-medium text-slate-500 uppercase tracking-wider">Total Receitas</span>
                    <div className="bg-emerald-50 p-2 rounded-lg text-emerald-600">
                      <PlusCircle className="w-5 h-5" />
                    </div>
                  </div>
                  <div className="text-3xl font-bold text-emerald-600">
                    R$ {totals.receitas.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </div>
                </div>

                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-sm font-medium text-slate-500 uppercase tracking-wider">Total Despesas</span>
                    <div className="bg-rose-50 p-2 rounded-lg text-rose-600">
                      <Trash2 className="w-5 h-5" />
                    </div>
                  </div>
                  <div className="text-3xl font-bold text-rose-600">
                    R$ {totals.despesas.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </div>
                </div>

                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-sm font-medium text-slate-500 uppercase tracking-wider">Saldo Final</span>
                    <div className="bg-indigo-50 p-2 rounded-lg text-indigo-600">
                      <CheckCircle2 className="w-5 h-5" />
                    </div>
                  </div>
                  <div className="text-3xl font-bold text-indigo-600">
                    R$ {totals.saldoFinal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </div>
                </div>
              </div>

              {/* Inconsistencies Alert */}
              {state.inconsistencias.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl flex gap-3">
                  <AlertCircle className="text-amber-600 w-5 h-5 shrink-0" />
                  <div>
                    <h3 className="text-sm font-bold text-amber-800">Inconsistências Detectadas</h3>
                    <ul className="mt-1 text-sm text-amber-700 list-disc list-inside">
                      {state.inconsistencias.map((inc, i) => (
                        <li key={i}>{inc}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              {/* Category Breakdown */}
              <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100">
                <h3 className="text-lg font-bold mb-6">Despesas por Categoria</h3>
                <div className="space-y-4">
                  {Array.from(new Set(state.items.filter(i => i.tipo === 'despesa').map(i => i.categoria))).map(cat => {
                    const catTotal = state.items.filter(i => i.categoria === cat && i.tipo === 'despesa').reduce((acc, curr) => acc + curr.valor, 0);
                    const percentage = (catTotal / (totals.despesas || 1)) * 100;
                    return (
                      <div key={cat} className="space-y-1">
                        <div className="flex justify-between text-sm">
                          <span className="font-medium text-slate-700">{cat}</span>
                          <span className="text-slate-500">R$ {catTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} ({percentage.toFixed(1)}%)</span>
                        </div>
                        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-indigo-500 rounded-full" 
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                  {state.items.filter(i => i.tipo === 'despesa').length === 0 && (
                    <div className="text-center py-8 text-slate-400 italic">Nenhuma despesa registrada.</div>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {/* Items Tab */}
          {state.activeTab === 'items' && (
            <motion.div 
              key="items"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
                <div>
                  <h2 className="text-xl font-bold text-slate-900">Lançamentos Financeiros</h2>
                  <p className="text-sm text-slate-500">Envie seus documentos (PDF ou Imagem) para extração automática.</p>
                </div>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => fileInputRef.current?.click()}
                    disabled={state.isProcessing}
                    className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-2xl font-bold transition-all disabled:opacity-50 shadow-lg shadow-indigo-100"
                  >
                    {state.isProcessing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
                    Envie seu documento (PDF)
                  </button>
                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    className="hidden" 
                    multiple 
                    accept="image/*,application/pdf"
                    onChange={(e) => e.target.files && processFiles(e.target.files)}
                  />
                </div>
              </div>

              <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Nº Ordem</th>
                      <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Data</th>
                      <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Descrição</th>
                      <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Classificação</th>
                      <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">R$</th>
                      <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-center">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {[...state.items].sort((a,b) => a.data.localeCompare(b.data)).map((item, idx) => (
                      <tr key={item.id} className="hover:bg-slate-50 transition-colors group">
                        <td className="px-6 py-4 text-sm text-slate-400 font-mono">
                          {(idx + 1).toString().padStart(4, '0')}
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-600 whitespace-nowrap">
                          {new Date(item.data).toLocaleDateString('pt-BR')}
                        </td>
                        <td className="px-6 py-4 text-sm font-medium text-slate-900">
                          {item.descricao}
                          {item.estabelecimento && (
                            <span className="block text-xs text-slate-400 font-normal">{item.estabelecimento}</span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-800">
                            {item.categoria}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className={cn(
                            "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium",
                            item.tipo === 'receita' ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"
                          )}>
                            {item.tipo.charAt(0).toUpperCase() + item.tipo.slice(1)}
                          </span>
                        </td>
                        <td className={cn(
                          "px-6 py-4 text-sm font-bold text-right whitespace-nowrap",
                          item.tipo === 'receita' ? "text-emerald-600" : "text-rose-600"
                        )}>
                          {item.tipo === 'despesa' ? '-' : '+'} R$ {item.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-6 py-4 text-center">
                          <button 
                            onClick={() => removeItem(item.id)}
                            className="text-slate-400 hover:text-rose-600 transition-colors p-1"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                    {state.items.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-6 py-12 text-center text-slate-400 italic">
                          Nenhum lançamento encontrado. Envie seu documento (PDF) para começar.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </motion.div>
          )}

          {/* Report Tab */}
          {state.activeTab === 'report' && (
            <motion.div 
              key="report"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="space-y-6"
            >
              <div className="flex justify-end">
                <button 
                  onClick={downloadPdf}
                  className="flex items-center gap-2 bg-indigo-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200"
                >
                  <FileDown className="w-5 h-5" />
                  Baixar Relatório em PDF
                </button>
              </div>

              <div ref={reportRef} className="bg-white p-12 rounded-2xl shadow-sm border border-slate-100 legal-report max-w-none print:shadow-none print:border-none print:p-0">
                <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>{generateReport()}</ReactMarkdown>
              </div>
            </motion.div>
          )}

          {/* Config Tab */}
          {state.activeTab === 'config' && (
            <motion.div 
              key="config"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-8 max-w-4xl mx-auto"
            >
              {/* Guia de Uso */}
              <div className="bg-white rounded-3xl p-8 shadow-sm border border-slate-100 space-y-6">
                <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
                  <div className="p-2 bg-indigo-50 rounded-xl">
                    <Info className="w-5 h-5 text-indigo-600" />
                  </div>
                  <h2 className="text-xl font-bold text-slate-900">Como Usar o CuratelaAI</h2>
                </div>
                
                <div className="grid md:grid-cols-3 gap-6">
                  <div className="space-y-2">
                    <div className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center text-sm font-bold text-slate-600">1</div>
                    <h3 className="font-semibold text-slate-900">Configure os Dados</h3>
                    <p className="text-sm text-slate-500 leading-relaxed">Preencha os nomes do curador, curatelado e as informações bancárias iniciais nesta aba.</p>
                  </div>
                  <div className="space-y-2">
                    <div className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center text-sm font-bold text-slate-600">2</div>
                    <h3 className="font-semibold text-slate-900">Envie seu Documento</h3>
                    <p className="text-sm text-slate-500 leading-relaxed">Na aba "Lançamentos", envie seus extratos e recibos em PDF. Nossa IA extrairá os valores automaticamente.</p>
                  </div>
                  <div className="space-y-2">
                    <div className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center text-sm font-bold text-slate-600">3</div>
                    <h3 className="font-semibold text-slate-900">Gere o Relatório</h3>
                    <p className="text-sm text-slate-500 leading-relaxed">Confira os totais no "Painel" e gere o PDF final na aba "Relatório Jurídico".</p>
                  </div>
                </div>

                <div className="bg-indigo-50/50 rounded-2xl p-4 flex items-start gap-4">
                  <CloudCheck className="w-6 h-6 text-indigo-600 shrink-0 mt-1" />
                  <div>
                    <h4 className="font-bold text-indigo-900 text-sm">Salvamento na Nuvem</h4>
                    <p className="text-indigo-700/80 text-xs leading-relaxed">
                      Ao fazer login com o Google (no topo da página), seu progresso é salvo automaticamente. 
                      Você pode parar e continuar de qualquer dispositivo sem perder seus lançamentos.
                    </p>
                  </div>
                </div>
              </div>

              {/* Dados da Prestação de Contas */}
              <div className="bg-white shadow-sm border border-slate-400 overflow-hidden">
                <div className="bg-[#cccccc] py-1 px-4 border-b border-slate-400 text-center">
                  <h3 className="text-sm font-bold text-black uppercase tracking-wide">Dados da Prestação de Contas</h3>
                </div>
                <div className="p-6 space-y-2">
                  <div className="grid grid-cols-[250px_1fr] items-center gap-0 border-b border-slate-100 pb-2">
                    <label className="text-sm font-medium text-black">Curador:</label>
                    <input 
                      type="text" 
                      value={state.curador}
                      onChange={(e) => setState(prev => ({ ...prev, curador: e.target.value }))}
                      className="w-full px-2 py-0.5 bg-[#ffffcc] border border-black text-sm outline-none"
                    />
                  </div>
                  <div className="grid grid-cols-[250px_1fr] items-center gap-0 border-b border-slate-100 pb-2">
                    <label className="text-sm font-medium text-black">Curatelado:</label>
                    <input 
                      type="text" 
                      value={state.curatelado}
                      onChange={(e) => setState(prev => ({ ...prev, curatelado: e.target.value }))}
                      className="w-full px-2 py-0.5 bg-[#ffffcc] border border-black text-sm outline-none"
                    />
                  </div>
                  <div className="grid grid-cols-[250px_1fr] items-center gap-0 border-b border-slate-100 pb-2">
                    <label className="text-sm font-medium text-black">Mês de início da prest. de contas:</label>
                    <input 
                      type="text" 
                      value={state.mesInicio}
                      onChange={(e) => setState(prev => ({ ...prev, mesInicio: e.target.value }))}
                      className="w-[200px] px-2 py-0.5 bg-[#ffffcc] border border-black text-sm outline-none"
                    />
                  </div>
                  <div className="grid grid-cols-[250px_1fr] items-center gap-0 border-b border-slate-100 pb-2">
                    <label className="text-sm font-medium text-black">Ano de início da prest. de contas:</label>
                    <input 
                      type="text" 
                      value={state.anoInicio}
                      onChange={(e) => setState(prev => ({ ...prev, anoInicio: e.target.value }))}
                      className="w-[200px] px-2 py-0.5 bg-[#ffffcc] border border-black text-sm outline-none"
                    />
                  </div>
                  <div className="grid grid-cols-[250px_1fr] items-center gap-0 border-b border-slate-100 pb-2">
                    <label className="text-sm font-medium text-black">Mês de fim da prest. de contas:</label>
                    <input 
                      type="text" 
                      value={state.mesFim}
                      onChange={(e) => setState(prev => ({ ...prev, mesFim: e.target.value }))}
                      className="w-[200px] px-2 py-0.5 bg-[#ffffcc] border border-black text-sm outline-none"
                    />
                  </div>
                  <div className="grid grid-cols-[250px_1fr] items-center gap-0 border-b border-slate-100 pb-2">
                    <label className="text-sm font-medium text-black">Ano de fim da prest. de contas:</label>
                    <input 
                      type="text" 
                      value={state.anoFim}
                      onChange={(e) => setState(prev => ({ ...prev, anoFim: e.target.value }))}
                      className="w-[200px] px-2 py-0.5 bg-[#ffffcc] border border-black text-sm outline-none"
                    />
                  </div>
                  <div className="grid grid-cols-[250px_1fr] items-center gap-0">
                    <label className="text-sm font-medium text-black">Saldo Inicial em Caixa (R$):</label>
                    <input 
                      type="number" 
                      value={state.saldoInicialCaixa}
                      onChange={(e) => setState(prev => ({ ...prev, saldoInicialCaixa: e.target.value }))}
                      className="w-[200px] px-2 py-0.5 bg-[#ffffcc] border border-black text-sm outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Informações Bancárias */}
              <div className="bg-white shadow-sm border border-slate-400 overflow-hidden">
                <div className="bg-[#cccccc] py-1 px-4 border-b border-slate-400 text-center">
                  <h3 className="text-sm font-bold text-black uppercase tracking-wide">Informações Bancárias</h3>
                </div>
                <div className="p-6 space-y-4">
                  <p className="text-sm text-black">
                    Relacione as contas bancárias (ignore em caso de inexistência de conta bancária):
                  </p>
                  
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse border border-black">
                      <thead>
                        <tr className="bg-slate-100">
                          <th className="border border-black px-2 py-1 text-left text-xs font-bold text-black">Nome do Banco</th>
                          <th className="border border-black px-2 py-1 text-left text-xs font-bold text-black">Tipo de Conta</th>
                          <th className="border border-black px-2 py-1 text-left text-xs font-bold text-black">Agência</th>
                          <th className="border border-black px-2 py-1 text-left text-xs font-bold text-black">Número da Conta</th>
                          <th className="border border-black px-2 py-1 text-left text-xs font-bold text-black">Saldo Inicial</th>
                          <th className="border border-black px-2 py-1 text-center text-xs font-bold text-black">Ações</th>
                        </tr>
                      </thead>
                      <tbody>
                        {state.contasBancarias.map((conta, idx) => (
                          <tr key={conta.id}>
                            <td className="border border-black p-0">
                              <input 
                                type="text" 
                                value={conta.banco}
                                onChange={(e) => {
                                  const newContas = [...state.contasBancarias];
                                  newContas[idx].banco = e.target.value;
                                  setState(prev => ({ ...prev, contasBancarias: newContas }));
                                }}
                                className="w-full px-2 py-1 bg-[#ffffcc] text-sm outline-none focus:bg-white"
                              />
                            </td>
                            <td className="border border-black p-0">
                              <input 
                                type="text" 
                                value={conta.tipo}
                                onChange={(e) => {
                                  const newContas = [...state.contasBancarias];
                                  newContas[idx].tipo = e.target.value;
                                  setState(prev => ({ ...prev, contasBancarias: newContas }));
                                }}
                                className="w-full px-2 py-1 bg-[#ffffcc] text-sm outline-none focus:bg-white"
                              />
                            </td>
                            <td className="border border-black p-0">
                              <input 
                                type="text" 
                                value={conta.agencia}
                                onChange={(e) => {
                                  const newContas = [...state.contasBancarias];
                                  newContas[idx].agencia = e.target.value;
                                  setState(prev => ({ ...prev, contasBancarias: newContas }));
                                }}
                                className="w-full px-2 py-1 bg-[#ffffcc] text-sm outline-none focus:bg-white"
                              />
                            </td>
                            <td className="border border-black p-0">
                              <input 
                                type="text" 
                                value={conta.conta}
                                onChange={(e) => {
                                  const newContas = [...state.contasBancarias];
                                  newContas[idx].conta = e.target.value;
                                  setState(prev => ({ ...prev, contasBancarias: newContas }));
                                }}
                                className="w-full px-2 py-1 bg-[#ffffcc] text-sm outline-none focus:bg-white"
                              />
                            </td>
                            <td className="border border-black p-0">
                              <input 
                                type="number" 
                                value={conta.saldoInicial}
                                onChange={(e) => {
                                  const newContas = [...state.contasBancarias];
                                  newContas[idx].saldoInicial = e.target.value;
                                  setState(prev => ({ ...prev, contasBancarias: newContas }));
                                }}
                                className="w-full px-2 py-1 bg-[#ffffcc] text-sm outline-none focus:bg-white"
                              />
                            </td>
                            <td className="border border-black px-2 py-1 text-center">
                              <button 
                                onClick={() => setState(prev => ({ 
                                  ...prev, 
                                  contasBancarias: prev.contasBancarias.filter(c => c.id !== conta.id) 
                                }))}
                                className="text-rose-600 hover:text-rose-800 transition-colors"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <button 
                    onClick={() => setState(prev => ({ 
                      ...prev, 
                      contasBancarias: [...prev.contasBancarias, { id: Math.random().toString(), banco: '', tipo: '', agencia: '', conta: '', saldoInicial: '' }] 
                    }))}
                    className="text-indigo-600 hover:text-indigo-700 text-sm font-medium flex items-center gap-1 mt-2"
                  >
                    <Plus className="w-4 h-4" /> Adicionar Conta
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Processing Overlay */}
      <AnimatePresence>
        {state.isProcessing && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          >
            <div className="bg-white p-8 rounded-3xl shadow-2xl max-w-sm w-full text-center space-y-4">
              <div className="relative w-16 h-16 mx-auto">
                <div className="absolute inset-0 border-4 border-indigo-100 rounded-full" />
                <div className="absolute inset-0 border-4 border-indigo-600 rounded-full border-t-transparent animate-spin" />
              </div>
              <h3 className="text-xl font-bold">Processando Documentos</h3>
              <p className="text-slate-500 text-sm">
                Nossa IA está analisando seus arquivos para extrair datas, valores e categorias automaticamente.
              </p>
              <div className="pt-2">
                <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <motion.div 
                    initial={{ width: "0%" }}
                    animate={{ width: "100%" }}
                    transition={{ duration: 10, repeat: Infinity }}
                    className="h-full bg-indigo-600"
                  />
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
