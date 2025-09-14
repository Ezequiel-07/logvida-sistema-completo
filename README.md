typ
# LogVida - Sistema de Gerenciamento Logístico

Este é um projeto Next.js, construído e gerenciado no Firebase Studio, que serve como um sistema completo para uma transportadora especializada, com foco no setor da saúde.

## Visão Geral

O LogVida é uma aplicação robusta que abrange todo o fluxo operacional e administrativo de uma transportadora, incluindo:

-   **Gerenciamento de Clientes, Motoristas e Veículos.**
-   **Criação de Definições de Rota** com cálculo de distância e otimização.
-   **Geração de Ordens de Serviço** com precificação flexível (por rota ou por caixa).
-   **Portal do Cliente** para acompanhamento de pedidos em tempo real, histórico e solicitação de novos orçamentos.
-   **Painel do Motorista** para execução de rotas passo a passo com check-in por geolocalização.
-   **Módulo Financeiro** para faturamento, relatórios e análise de custos.
-   **Comunicação Integrada** via chat interno.
-   **Notificações Push** para manter todos os stakeholders informados.

## Tecnologias Utilizadas

-   **Framework:** Next.js (com App Router)
-   **Linguagem:** TypeScript
-   **Estilização:** Tailwind CSS
-   **Componentes UI:** shadcn/ui
-   **Banco de Dados:** Firestore (Firebase)
-   **Autenticação:** Firebase Authentication
-   **Notificações:** Firebase Cloud Messaging (FCM)
-   **Mapas:** Google Maps API

## Começando

Para rodar o projeto localmente, siga os passos abaixo.

### 1. Pré-requisitos

-   Node.js (versão 18 ou superior)
-   npm ou yarn
-   Uma conta no Firebase com um projeto configurado (Firestore, Auth, Functions).
-   Uma conta no Google Cloud com as seguintes APIs ativadas e uma conta de faturamento associada:
    -   Maps JavaScript API
    -   Places API
    -   Directions API
    -   Routes API

### 2. Configuração do Ambiente

1.  Clone o repositório.
2.  Instale as dependências:
    ```bash
    npm install
    ```
3.  Crie um arquivo `.env.local` na raiz do projeto e adicione as variáveis de ambiente do seu projeto Firebase e Google Cloud. **Atenção:** Você precisará de **DUAS** chaves de API do Google Maps distintas.

    ```env
    # Firebase - Client-side configuration
    NEXT_PUBLIC_FIREBASE_API_KEY=...
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...
    NEXT_PUBLIC_FIREBASE_PROJECT_ID=...
    NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=...
    NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
    NEXT_PUBLIC_FIREBASE_APP_ID=...
    
    # Firebase - Public Key for FCM Web Push Notifications
    # Como obter: No console do Firebase > Configurações do Projeto > Cloud Messaging > Configuração da Web.
    # Em "Certificados de push da Web", clique em "Gerar par de chaves".
    NEXT_PUBLIC_FIREBASE_VAPID_KEY=...
    
    # --- Google Maps API Keys ---

    # CHAVE PÚBLICA (Client-side): Usada para mostrar os mapas e o autocompletar de endereços no navegador.
    # No Google Cloud:
    # 1. Crie uma chave de API.
    # 2. Em "Restrições de chave", selecione "Sites" e adicione seus domínios (ex: localhost:3000, seu-dominio.com).
    # 3. Em "Restrições de API", selecione "Restringir chave" e habilite:
    #    - Maps JavaScript API
    #    - Places API
    #    - Directions API
    NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=AIza...

    # ID DO MAPA (Client-side, Opcional): Usado para aplicar um estilo personalizado do Google Cloud.
    # No Google Cloud:
    # 1. Vá para Google Maps Platform > Estilos de mapa.
    # 2. Crie ou selecione um estilo e copie o ID do mapa.
    # 3. Associe este ID do mapa à sua CHAVE PÚBLICA (client-side) nas configurações da chave.
    NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID=seu_map_id_aqui

    # CHAVE DO SERVIDOR (Server-side): Usada para calcular rotas e pedágios. É SECRETA.
    # No Google Cloud:
    # 1. Crie uma *SEGUNDA* chave de API.
    # 2. **NÃO** adicione restrições de "Sites" a esta chave. Deixe como "Nenhuma".
    # 3. Em "Restrições de API", selecione "Restringir chave" e habilite:
    #    - Routes API
    GOOGLE_MAPS_SERVER_API_KEY=AIza...

    # Firebase Admin - Server-side credentials
    # Copie os valores do seu arquivo de credenciais JSON (service account).
    FIREBASE_PROJECT_ID=...
    FIREBASE_CLIENT_EMAIL=...
    
    # IMPORTANTE: A chave privada deve estar entre aspas e com as quebras de linha substituídas por `\n`.
    # Exemplo de como deve ficar no arquivo .env.local:
    # FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIC...restante...da...chave...aqui\n-----END PRIVATE KEY-----\n"
    FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIC...restante...da...chave...aqui\n-----END PRIVATE KEY-----\n"
    ```

**Nota sobre Ambientes:** O arquivo `.env.local` é usado **apenas** para o desenvolvimento local. Quando o projeto é implantado no Firebase App Hosting, as variáveis de ambiente são injetadas de forma segura a partir do Secret Manager, conforme configurado no arquivo `apphosting.yaml`. O código está preparado para funcionar em ambos os ambientes sem modificações.

### 3. Rodando o Aplicativo

Para rodar o aplicativo Next.js, execute o seguinte comando:
```bash
npm run dev
```
Isso iniciará a interface do usuário em `http://localhost:3000`.

### 4. Compilando para Android (Capacitor)

Para compilar e sincronizar a aplicação web com o projeto nativo do Android, use o novo comando:
```bash
npm run build:android
```
Este comando irá primeiro gerar a versão de produção do seu site (`npm run build`) e, em seguida, sincronizar esses arquivos com o projeto Android (`npx cap sync android`).

Após a sincronização, você pode abrir o projeto Android no Android Studio para compilar e rodar no emulador ou em um dispositivo físico.
```bash
npx cap open android
```


## Estrutura do Projeto

-   `/src/app`: Contém todas as rotas e páginas do aplicativo.
    -   `/(app)`: Rotas protegidas para administradores e motoristas.
    -   `/(client)`: Rotas do portal do cliente.
    -   `/(public)`: Páginas públicas como a landing page e a de solicitação de orçamento.
-   `/src/components`: Componentes React reutilizáveis.
-   `/src/contexts`: Provedores de contexto (Autenticação, Notificações).
-   `/src/hooks`: Hooks customizados.
-   `/src/lib`: Funções utilitárias e configuração do Firebase.
-   `/src/types`: Definições de tipos TypeScript para o projeto.
