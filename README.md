# AutoDub Pro - Configuração para Deploy na Vercel

Este projeto foi configurado para deploy na Vercel usando o Vite.

## ⚠️ Importante: Configuração Manual Necessária para o FFmpeg

O motor de processamento de áudio (FFmpeg) requer alguns arquivos que você deve baixar manualmente e colocar no diretório correto antes de fazer o deploy.

1.  **Crie o Diretório**: Na raiz do seu projeto, crie uma pasta chamada `public`, e dentro dela, crie outra pasta chamada `ffmpeg-core`. O caminho final deve ser `public/ffmpeg-core/`.

2.  **Baixe os Arquivos do Core do FFmpeg**: Você precisa baixar dois arquivos da versão `0.12.6` do `@ffmpeg/core-st`.
    *   **`ffmpeg-core.js`**: [Link para Download](https://unpkg.com/@ffmpeg/core-st@0.12.6/dist/esm/ffmpeg-core.js)
    *   **`ffmpeg-core.wasm`**: [Link para Download](https://unpkg.com/@ffmpeg/core-st@0.12.6/dist/esm/ffmpeg-core.wasm)

3.  **Coloque os Arquivos**: Coloque ambos os arquivos baixados (`ffmpeg-core.js` e `ffmpeg-core.wasm`) dentro do diretório `public/ffmpeg-core/`.

Sua estrutura de projeto deve ficar assim:
```
/
├── public/
│   └── ffmpeg-core/
│       ├── ffmpeg-core.js
│       └── ffmpeg-core.wasm
├── src/
│   └── ... (todos os seus componentes e serviços)
├── package.json
├── vercel.json
└── ... (outros arquivos de configuração)
```
**Este passo é crítico. A aplicação não funcionará sem esses arquivos.**

---

## Desenvolvimento Local

1.  **Instale as Dependências**:
    ```bash
    npm install
    ```

2.  **Execute o Servidor de Desenvolvimento**:
    ```bash
    npm run dev
    ```
    Isso iniciará um servidor local, geralmente em `http://localhost:5173`.

## Deploy na Vercel

1.  **Envie para o Git**: Faça o push do seu projeto para um repositório no GitHub, GitLab ou Bitbucket.

2.  **Importe o Projeto na Vercel**:
    *   Faça login na sua conta Vercel.
    *   Clique em "Add New..." -> "Project".
    *   Importe o repositório Git para o qual você acabou de enviar o código.

3.  **Configure e Faça o Deploy**:
    *   A Vercel detectará automaticamente que você está usando **Vite** e configurará as definições de build corretamente.
    *   **Framework Preset**: `Vite`
    *   **Build Command**: `vite build` (deve ser o padrão)
    *   **Output Directory**: `dist` (deve ser o padrão)
    *   Clique em **Deploy**.

A Vercel irá construir e fazer o deploy da sua aplicação. O arquivo `vercel.json` neste repositório configura automaticamente os cabeçalhos de servidor necessários para que o FFmpeg funcione corretamente.
