<script>
  import Login from './Login.svelte';
  import Loading from './Loading.svelte';
  import Dashboard from './Dashboard.svelte';
  import ToolWrapper from './components/ToolWrapper.svelte';
  import { getToolById } from './tools/toolsRegistry.js';

  // Helper para URL da API (suporta desenvolvimento e produção)
  const API_URL = import.meta.env.VITE_API_URL || '';
  const getApiUrl = (path) => {
    // Se path já é uma URL completa, retorna como está
    if (path.startsWith('http://') || path.startsWith('https://')) {
      return path;
    }
    
    // Se temos uma URL base configurada, usa ela
    if (API_URL && API_URL.trim() !== '') {
      const base = API_URL.replace(/\/$/, '');
      const cleanPath = path.startsWith('/') ? path : `/${path}`;
      return `${base}${cleanPath}`;
    }
    
    // Detectar automaticamente a URL do backend
    if (typeof window !== 'undefined') {
      const hostname = window.location.hostname;
      const protocol = window.location.protocol;
      const currentPort = window.location.port;
      
      // Se estiver em localhost, assume que o backend está na porta 3001
      if (hostname === 'localhost' || hostname === '127.0.0.1') {
        if (import.meta.env.DEV) {
          // Modo desenvolvimento - proxy do Vite deve funcionar
          return path;
        } else {
          // Modo produção - precisa da URL completa
          return `http://${hostname}:3001${path}`;
        }
      }
      
      // Em Replit ou outros ambientes de produção
      // Detecta se está em Replit (janeway, kirk, etc)
      const isReplit = hostname.includes('.replit.dev') || hostname.includes('.repl.co') || hostname.includes('.janeway.');
      
      if (isReplit) {
        // Em Replit, o backend geralmente está na porta 3000
        // Usa o mesmo protocolo e hostname, apenas muda a porta
        const backendPort = '3000';
        return `${protocol}//${hostname}:${backendPort}${path}`;
      }
      
      // Para outros ambientes de produção
      // Se a porta atual for do frontend (5174, 5173, etc), tenta a porta do backend
      const frontendPorts = ['5174', '5173', '5175', '8080'];
      if (currentPort && frontendPorts.includes(currentPort)) {
        // Tenta porta 3000 primeiro (padrão comum), depois 3001
        const backendPort = '3000';
        return `${protocol}//${hostname}:${backendPort}${path}`;
      }
      
      // Se não detectou porta específica, tenta porta 3000 (padrão comum)
      if (!currentPort || currentPort === '80' || currentPort === '443' || currentPort === '') {
        return `${protocol}//${hostname}:3000${path}`;
      }
      
      // Fallback: usa path relativo (pode funcionar se backend estiver na mesma origem)
      return path;
    }
    
    return path;
  };

  // ============================================
  // ESTADO DO PORTAL (Gerenciamento Global)
  // ============================================
  
  // Estado de autenticação
  let isLoggedIn = false;
  let currentUser = '';
  let userTipo = 'user'; // Tipo de usuário: 'admin' ou 'user'
  let isLoading = false;
  let loadingMessage = '';
  let heartbeatInterval = null;
  let currentView = 'dashboard'; // 'dashboard' ou 'tool' (ferramenta específica)
  let currentTool = null; // ID da ferramenta atual
  let toolSettingsHandler = null; // Função de configurações da ferramenta atual

  // ============================================
  // FUNÇÕES DO PORTAL (Gerenciamento Global)
  // ============================================
  
  // Função para iniciar heartbeat (manter usuário online)
  function startHeartbeat() {
    // Limpar intervalo anterior se existir
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
    }
    
    // Enviar heartbeat a cada 2 minutos
    heartbeatInterval = setInterval(async () => {
      if (currentUser && isLoggedIn) {
        try {
          await fetch(getApiUrl('/api/users/heartbeat'), {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ usuario: currentUser })
          });
        } catch (err) {
          console.error('Erro ao enviar heartbeat:', err);
        }
      }
    }, 2 * 60 * 1000); // 2 minutos
  }
  
  // Função para parar heartbeat
  function stopHeartbeat() {
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
      heartbeatInterval = null;
    }
  }

  // Função chamada quando o login é bem-sucedido
  async function handleLoginSuccess() {
    // Carregar nome do usuário e tipo do localStorage
    try {
      if (typeof localStorage !== 'undefined') {
        currentUser = localStorage.getItem('usuario') || '';
        userTipo = localStorage.getItem('userTipo') || 'user'; // Default para 'user'
      }
    } catch (err) {
      console.error('Erro ao carregar usuário:', err);
    }
    
    // Mostrar Dashboard imediatamente (sem await)
    isLoggedIn = true;
    currentView = 'dashboard';
    currentTool = null;
    
    // Iniciar heartbeat em background (não bloquear)
    startHeartbeat();
  }

  // Função para selecionar uma ferramenta do Dashboard
  async function handleToolSelect(toolId) {
    const tool = getToolById(toolId);
    
    if (!tool || !tool.available) {
      console.error(`Ferramenta ${toolId} não encontrada ou não disponível`);
      return;
    }
    
    // Definir ferramenta atual
    currentTool = toolId;
    currentView = 'tool';
    
    // Cada ferramenta gerencia sua própria inicialização através do onMount do componente
    // Não precisamos inicializar aqui - o componente fará isso quando for montado
  }

  // Função para voltar ao Dashboard
  function handleBackToDashboard() {
    currentView = 'dashboard';
    currentTool = null;
    toolSettingsHandler = null; // Limpar handler de configurações
    // Cada ferramenta gerencia sua própria limpeza através do onDestroy do componente
  }

  // Função para registrar handler de configurações da ferramenta
  function registerToolSettings(handler) {
    toolSettingsHandler = handler;
  }

  // Função para abrir configurações (chamada pelo ToolWrapper)
  function handleOpenSettings() {
    if (toolSettingsHandler && typeof toolSettingsHandler === 'function') {
      toolSettingsHandler();
    }
  }

  // Função de logout
  async function handleLogout() {
    try {
      // Notificar backend sobre logout
      if (currentUser) {
        try {
          await fetch(getApiUrl('/api/auth/logout'), {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ usuario: currentUser })
          });
        } catch (err) {
          console.error('Erro ao notificar logout:', err);
        }
      }
      
      // Limpar localStorage
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem('isLoggedIn');
        localStorage.removeItem('usuario');
        localStorage.removeItem('userTipo');
      }
      // Parar heartbeat
      stopHeartbeat();
      
      // Resetar estado
      isLoggedIn = false;
      currentUser = '';
      currentView = 'dashboard';
      currentTool = null;
      userTipo = 'user';
    } catch (err) {
      console.error('Erro ao fazer logout:', err);
    }
  }

  // onMount removido - cada ferramenta gerencia sua própria inicialização

</script>

<!-- Tela de Login -->
{#if !isLoggedIn && !isLoading}
  <Login onLoginSuccess={handleLoginSuccess} />
{:else if isLoading}
  <!-- Tela de Loading -->
  <Loading currentMessage={loadingMessage} />
{:else if currentView === 'dashboard'}
  <!-- Dashboard -->
  <Dashboard 
    currentUser={currentUser}
    onToolSelect={handleToolSelect}
    onLogout={handleLogout}
  />
{:else}
  <!-- Conteúdo Principal (Ferramenta) - Renderização Dinâmica -->
  {#if currentTool}
    {@const tool = getToolById(currentTool)}
    {#if tool && tool.component}
      <!-- Todas as ferramentas são renderizadas da mesma forma -->
      <ToolWrapper
        toolTitle={tool.title}
        onBackToDashboard={handleBackToDashboard}
        onOpenSettings={handleOpenSettings}
        showSettingsButton={toolSettingsHandler !== null}
      >
        <svelte:component this={tool.component} 
          currentUser={currentUser}
          userTipo={userTipo}
          onBackToDashboard={handleBackToDashboard}
          onSettingsRequest={registerToolSettings}
        />
      </ToolWrapper>
    {:else}
      <div class="error-container">
        <h2>Ferramenta não encontrada</h2>
        <p>A ferramenta selecionada não está disponível.</p>
        <button on:click={handleBackToDashboard}>Voltar ao Dashboard</button>
      </div>
    {/if}
  {/if}
{/if}

<style>
  :global(body) {
    margin: 0;
    padding: 0;
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
  }

  .error-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 2rem;
    text-align: center;
  }

  .error-container h2 {
    color: #7B68EE;
    margin-bottom: 1rem;
  }

  .error-container button {
    background: linear-gradient(135deg, #7B68EE 0%, #6B5BEE 100%);
    color: white;
    border: none;
    border-radius: 8px;
    padding: 0.75rem 1.5rem;
    font-size: 1rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
    margin-top: 1rem;
  }

  .error-container button:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 8px rgba(123, 104, 238, 0.3);
  }
</style>
