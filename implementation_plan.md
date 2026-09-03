# Adição de Geração de Listing via IA

Este plano descreve como vamos adicionar a funcionalidade de geração de anúncios por Inteligência Artificial no PreListing, permitindo que você preencha algumas dicas iniciais e a IA construa ou reescreva o conteúdo otimizado para a Amazon.

> [!IMPORTANT]
> **User Review Required**
> Para que a IA funcione, precisamos de uma API de inteligência artificial (como OpenAI/ChatGPT, Anthropic Claude ou Google Gemini). Por favor, veja a seção "Open Questions" abaixo e responda como deseja proceder.

## Open Questions

> [!WARNING]
> **Qual provedor de IA vamos usar?**
> Precisaremos adicionar uma chave de API no arquivo `.env`. Você prefere usar **OpenAI (ChatGPT)** ou **Google Gemini**? (A OpenAI costuma ser a mais comum e barata para textos curtos, mas o Gemini tem um plano gratuito generoso). Me avise qual você prefere para que eu possa instalar a biblioteca correta (ex: `@google/genai` ou `openai`).

## Proposed Changes

Vamos adaptar a interface atual e criar um novo endpoint de API.

---

### UI (Frontend)

Vamos adicionar uma nova seção ou um botão inteligente na interface.

#### [MODIFY] `app/page.tsx`
- Adicionar uma nova seção no início: **"Geração Assistida por IA"**.
- Terá um campo de texto livre chamado **"Dicas / Rascunho / Texto Base"**, onde você pode colar rascunhos, links ou características chaves.
- Um botão **"Gerar/Otimizar Listing"**.
- Ao clicar no botão, ele pegará as informações já preenchidas no formulário (ex: Título, Descrição, Material, Cor) e o texto do campo de "Dicas", e enviará para nossa nova API de IA.
- Quando a API responder, ela atualizará os campos do formulário (Título, Bullets, Descrição, Keywords) automaticamente com os textos gerados e otimizados, prontos para sua revisão.

### Backend (API)

Vamos criar uma nova rota para processar a geração via IA.

#### [NEW] `app/api/generate/route.ts`
- Receberá os dados do formulário preenchidos parcialmente.
- Usará um *prompt* estruturado para instruir a IA a atuar como uma especialista em SEO da Amazon.
- Instrução baseada nas regras de:
  - Título atraente mas factual.
  - 5 Bullets focados em benefícios.
  - Descrição detalhada usando formatação HTML básica permitida.
  - Geração de 250 bytes de Keywords.
- Responderá com um objeto JSON estruturado contendo `title`, `bullets`, `description` e `keywords`.

## Verification Plan

### Manual Verification
- Preencher apenas "Produto: Placa de Alerta, Material: Alumínio" e verificar se a IA preenche Título, Bullets e Descrição de forma criativa e pertinente.
- Colar um texto de um concorrente no campo de Dicas e verificar se a IA reescreve de forma original.
- Validar se os campos da UI são atualizados corretamente com os dados gerados.
