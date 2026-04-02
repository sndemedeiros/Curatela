# CuratelaAI ⚖️🤖

Uma plataforma inteligente desenvolvida para auxiliar curadores na elaboração de prestações de contas judiciais. O **CuratelaAI** utiliza Inteligência Artificial (Google Gemini) para extrair automaticamente dados de extratos bancários, recibos e notas fiscais, organizando tudo em um relatório pronto para ser apresentado à justiça.

## 🚀 Funcionalidades

- **Login Seguro:** Autenticação via Google (Firebase Auth).
- **Extração com IA:** Envie arquivos PDF ou imagens e deixe que o Google Gemini extraia datas, valores, categorias e estabelecimentos.
- **Salvamento Automático:** Seus dados são sincronizados em tempo real com o Firebase Firestore.
- **Dashboard Financeiro:** Visualize o resumo de receitas, despesas e saldo final, com gráficos por categoria.
- **Relatório Jurídico:** Gere um PDF formatado seguindo os padrões de prestação de contas, pronto para baixar e imprimir.
- **Interface Moderna:** Design responsivo e intuitivo construído com Tailwind CSS e Framer Motion.

## 🛠️ Tecnologias Utilizadas

- **Frontend:** [React 19](https://react.dev/) + [Vite](https://vitejs.dev/)
- **Estilização:** [Tailwind CSS 4](https://tailwindcss.com/)
- **IA:** [Google Gemini AI](https://ai.google.dev/) (`@google/genai`)
- **Backend/Banco de Dados:** [Firebase](https://firebase.google.com/) (Auth & Firestore)
- **Animações:** [Framer Motion](https://www.framer.com/motion/)
- **PDF:** [html2pdf.js](https://ekoopmans.github.io/html2pdf.js/)

## ⚙️ Configuração Local

Para rodar o projeto na sua máquina:

1. **Clone o repositório:**
   ```bash
   git clone https://github.com/seu-usuario/curatela-ai.git
   cd curatela-ai
   ```

2. **Instale as dependências:**
   ```bash
   npm install
   ```

3. **Configure as Variáveis de Ambiente:**
   - Renomeie o arquivo `.env.example` para `.env`.
   - Preencha as chaves do Firebase e a sua `GEMINI_API_KEY`.
   - *Dica:* Você também pode usar o arquivo `firebase-applet-config.json` na raiz se estiver desenvolvendo localmente.

4. **Inicie o servidor de desenvolvimento:**
   ```bash
   npm run dev
   ```
   O app estará disponível em `http://localhost:3000`.

## 🌐 Deploy (Vercel)

Ao fazer o deploy no Vercel, lembre-se de configurar as seguintes **Environment Variables** no painel do projeto:

- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_APP_ID`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_FIRESTORE_DATABASE_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `GEMINI_API_KEY` (Necessária para a extração por IA)

## 📄 Licença

Este projeto está sob a licença Apache-2.0. Veja o arquivo [LICENSE](LICENSE) para mais detalhes.

---
Desenvolvido com ❤️ para facilitar a vida de quem cuida.
