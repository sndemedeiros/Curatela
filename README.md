CuratelaAI ⚖️🤖 — O CuratelaAI é uma plataforma desenvolvida para facilitar o trabalho de curadores na elaboração de prestações de contas judiciais.
Ele utiliza Inteligência Artificial (Google Gemini) para interpretar extratos bancários, recibos e notas fiscais, transformando essas informações em um relatório jurídico claro, organizado e pronto para apresentação.
A experiência do usuário é moderna e fluida, com interface responsiva, animações suaves, sincronização automática via Firebase Firestore, geração de PDF e autenticação segura com Google.
O projeto foi construído com React 19, Vite, Tailwind CSS 4, Google Gemini AI, Firebase, Framer Motion e html2pdf.js, garantindo desempenho, segurança e eficiência.

Para utilizar o sistema localmente, basta clonar o repositório com o comando git clone https://github.com/seu-usuario/curatela-ai.git.
Em seguida, acesse a pasta com cd curatela-ai.
Instale as dependências utilizando npm install.
Renomeie o arquivo .env.example para .env e preencha as chaves do Firebase junto com a variável GEMINI_API_KEY.
Com o ambiente configurado, inicie o servidor com npm run dev.
A aplicação ficará disponível em http://localhost:3000.

Para deploy em produção, como na Vercel, é necessário configurar no painel do provedor as variáveis de ambiente VITE_FIREBASE_API_KEY, VITE_FIREBASE_PROJECT_ID, VITE_FIREBASE_APP_ID, VITE_FIREBASE_AUTH_DOMAIN, VITE_FIREBASE_FIRESTORE_DATABASE_ID, VITE_FIREBASE_STORAGE_BUCKET, VITE_FIREBASE_MESSAGING_SENDER_ID e GEMINI_API_KEY.
O CuratelaAI é distribuído sob a licença Apache-2.0, cujo conteúdo completo está disponível no arquivo LICENSE.
Desenvolvido com ❤️ para facilitar a vida de quem cuida.
