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
  let isLoading = true; // Iniciar com loading ativo
  let loadingMessage = 'Carregando...';
  let heartbeatInterval = null;
  let currentView = null; // 'dashboard', 'tool', 'login' ou null (será definido pelo processUrl)
  let currentTool = null; // ID da ferramenta atual
  let toolSettingsHandler = null; // Função de configurações da ferramenta atual
  let toolSettingsHoverHandler = null; // Função de pré-carregamento no hover da engrenagem
  let broadcastChannel = null; // Canal de comunicação entre abas
  let isToolInNewTab = false; // Flag para indicar se a ferramenta está em nova aba

  // Função para criar favicon a partir de uma imagem PNG
  function createFaviconFromImage(imagePath) {
    try {
      if (typeof document === 'undefined' || typeof window === 'undefined') {
        console.warn('Document ou window não disponível');
        return;
      }
      
      console.log('Tentando carregar favicon de:', imagePath);
      console.log('URL completa seria:', window.location.origin + imagePath);
      
      const img = new Image();
      // Remover crossOrigin para imagens locais
      // img.crossOrigin = 'anonymous';
      
      img.onload = function() {
        try {
          console.log('Imagem do favicon carregada com sucesso');
          const canvas = document.createElement('canvas');
          canvas.width = 32;
          canvas.height = 32;
          const ctx = canvas.getContext('2d');
          
          if (!ctx) {
            console.warn('Não foi possível obter contexto 2D do canvas');
            return;
          }
          
          // Criar círculo perfeito
          const centerX = 16;
          const centerY = 16;
          const radius = 16; // Raio do círculo (metade do tamanho do canvas)
          
          ctx.beginPath();
          ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
          ctx.closePath();
          ctx.clip();
          
          // Fundo branco
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, 32, 32);
          
          // Desenhar a imagem redimensionada e centralizada
          ctx.drawImage(img, 4, 4, 24, 24);
          
          // Converter para data URL e atualizar favicon
          const dataUrl = canvas.toDataURL('image/png');
          updateFavicon(dataUrl);
          console.log('Favicon atualizado com sucesso');
        } catch (error) {
          console.warn('Erro ao processar imagem do favicon:', error);
        }
      };
      
      img.onerror = function(error) {
        // Se a imagem não carregar, tentar novamente com a imagem alares.png
        console.warn('Erro ao carregar imagem do favicon:', imagePath, error);
        // Se não for a imagem alares.png, tentar carregá-la
        if (imagePath !== '/favicons/alares.png') {
          console.log('Tentando carregar imagem alares.png como fallback');
          createFaviconFromImage('/favicons/alares.png');
        } else {
          // Se já estiver tentando carregar alares.png e falhar, não fazer nada
          // (manter o favicon padrão do HTML ou o que já estava)
          console.warn('Não foi possível carregar a imagem alares.png');
        }
      };
      
      img.src = imagePath;
    } catch (error) {
      console.warn('Erro ao criar favicon a partir de imagem:', error);
    }
  }

  // Função para criar favicon a partir de um emoji
  function createFaviconFromEmoji(emoji) {
    if (typeof document === 'undefined' || typeof window === 'undefined') return;
    
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext('2d');
    
    if (!ctx) return;
    
    // Criar círculo perfeito
    const centerX = 16;
    const centerY = 16;
    const radius = 16; // Raio do círculo (metade do tamanho do canvas)
    
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
    ctx.closePath();
    ctx.clip(); // Limitar a área de desenho ao círculo
    
    // Fundo branco
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 32, 32);
    
    // Usar uma fonte que suporta emojis melhor
    ctx.font = '24px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", "EmojiOne Color", "Android Emoji", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(emoji, 16, 16);
    
    // Converter para data URL e atualizar favicon
    const dataUrl = canvas.toDataURL('image/png');
    updateFavicon(dataUrl);
  }

  // Função para atualizar o favicon
  function updateFavicon(href) {
    if (typeof document === 'undefined') return;
    
    // Remover todos os favicons existentes
    const existingLinks = document.querySelectorAll("link[rel*='icon']");
    existingLinks.forEach(link => link.remove());
    
    // Criar novo link de favicon
    const link = document.createElement('link');
    link.rel = 'icon';
    link.type = 'image/png';
    link.href = href;
    document.head.appendChild(link);
    
    console.log('Favicon atualizado para:', href);
  }

  // Atualizar título e favicon da aba do navegador dinamicamente
  $: if (typeof document !== 'undefined') {
    if (currentView === 'tool' && currentTool) {
      const tool = getToolById(currentTool);
      if (tool) {
        document.title = tool.title;
        // Sempre usar imagem alares.png como favicon para todas as ferramentas
        createFaviconFromImage('/favicons/alares.png');
      } else {
        document.title = 'Viabilidade Alares - Engenharia';
        // Restaurar favicon padrão (imagem alares.png)
        createFaviconFromImage('/favicons/alares.png');
      }
    } else {
      // Dashboard, Login ou Loading: usar imagem alares.png como favicon
      if (currentView === 'dashboard' || isLoading) {
        document.title = 'Porta de Ferramentas - Engenharia';
      } else {
        document.title = 'Viabilidade Alares - Engenharia';
      }
      // Adicionar pequeno delay para garantir que o DOM esteja pronto
      setTimeout(() => {
        createFaviconFromImage('/favicons/alares.png');
      }, 100);
    }
  }

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
    let dotsInterval = null;
    
    try {
      // Carregar nome do usuário e tipo do localStorage primeiro
      try {
        if (typeof localStorage !== 'undefined') {
          currentUser = localStorage.getItem('usuario') || '';
          userTipo = localStorage.getItem('userTipo') || 'user'; // Default para 'user'
        }
      } catch (err) {
        console.error('Erro ao carregar usuário:', err);
      }
      
      // Mostrar tela de loading
      isLoading = true;
      isLoggedIn = true;
      
      // Aguardar um tick para garantir que o Svelte atualize o DOM
      await tick();
      
      // Animar "Carregando Dashboard" com três pontinhos
      dotsInterval = animateDots('Carregando Dashboard', (message) => {
        loadingMessage = message;
      });
      
      // Aguardar um pouco para mostrar a animação
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // Limpar intervalo anterior
      if (dotsInterval) {
        clearInterval(dotsInterval);
        dotsInterval = null;
      }
      
      // Animar "Preparando ambiente" com três pontinhos
      dotsInterval = animateDots('Preparando ambiente', (message) => {
        loadingMessage = message;
      });
      
      // Aguardar mais um pouco
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // Limpar intervalo
      if (dotsInterval) {
        clearInterval(dotsInterval);
        dotsInterval = null;
      }
      
      // Verificar se há hash na URL para carregar ferramenta específica
      if (typeof window !== 'undefined') {
        const hash = window.location.hash;
        if (hash && hash.startsWith('#/')) {
          const toolId = hash.substring(2);
          const tool = getToolById(toolId);
          if (tool && tool.available) {
            // Carregar ferramenta específica
            currentTool = toolId;
            currentView = 'tool';
            isToolInNewTab = true; // Marcar que está em nova aba (tem hash na URL)
            startHeartbeat();
            // Aguardar tick antes de ocultar loading
            await tick();
            isLoading = false;
            return;
          }
        }
      }
      
      // Se não há hash ou ferramenta inválida, mostrar Dashboard
      // Definir currentView ANTES de ocultar o loading
      currentView = 'dashboard';
      currentTool = null;
      isToolInNewTab = false; // Dashboard não está em nova aba
      
      // Iniciar heartbeat em background (não bloquear)
      startHeartbeat();
      
      // Aguardar um pouco mais para garantir que tudo está carregado
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Aguardar tick para garantir que o Svelte atualize o DOM
      await tick();
      
      // Garantir que currentView está definido
      if (!currentView || currentView === null) {
        currentView = 'dashboard';
      }
      
      // Ocultar loading e mostrar Dashboard
      isLoading = false;
      
      // Aguardar mais um tick após ocultar loading para garantir renderização
      await tick();
      
      // Log para debug
      console.log('✅ Login bem-sucedido:', {
        isLoggedIn,
        isLoading,
        currentView,
        currentUser
      });
    } catch (err) {
      console.error('❌ Erro ao processar login:', err);
      // Em caso de erro, garantir que o Dashboard seja exibido
      isLoggedIn = true;
      currentView = 'dashboard';
      isLoading = false;
      if (dotsInterval) {
        clearInterval(dotsInterval);
      }
    }
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
  async function handleBackToDashboard() {
    // Se a ferramenta está em nova aba, tentar encontrar Dashboard aberto
    if (isToolInNewTab && typeof window !== 'undefined' && broadcastChannel) {
      try {
        // Enviar mensagem para verificar se há Dashboard aberto
        const dashboardFound = await new Promise((resolve) => {
          const timeout = setTimeout(() => resolve(false), 500); // Timeout de 500ms
          
          const messageHandler = (event) => {
            if (event.data.type === 'dashboard-response') {
              clearTimeout(timeout);
              broadcastChannel.removeEventListener('message', messageHandler);
              resolve(true);
            }
          };
          
          broadcastChannel.addEventListener('message', messageHandler);
          broadcastChannel.postMessage({ type: 'dashboard-request' });
        });
        
        if (dashboardFound) {
          // Dashboard encontrado, focar na aba do Dashboard e fechar esta aba
          // Tentar focar na aba que abriu esta ferramenta (window.opener)
          if (window.opener && !window.opener.closed) {
            window.opener.focus();
            window.close();
          } else {
            // Se não tem window.opener, tentar encontrar a aba do Dashboard
            // Enviar mensagem para o Dashboard se focar
            broadcastChannel.postMessage({ type: 'focus-dashboard' });
            // Aguardar um pouco antes de fechar para dar tempo do Dashboard focar
            setTimeout(() => {
              window.close();
            }, 100);
          }
          return;
        }
      } catch (err) {
        console.warn('Erro ao verificar Dashboard aberto:', err);
      }
    }
    
    // Se não encontrou Dashboard ou não está em nova aba
    if (isToolInNewTab && typeof window !== 'undefined') {
      // Abrir Dashboard em nova aba
      const currentUrl = window.location.origin + window.location.pathname;
      const dashboardWindow = window.open(currentUrl, '_blank');
      // Fechar esta aba após abrir o Dashboard
      if (dashboardWindow) {
        setTimeout(() => {
          window.close();
        }, 100);
      }
    } else {
      // Comportamento normal: voltar ao Dashboard na mesma aba
      currentView = 'dashboard';
      currentTool = null;
      toolSettingsHandler = null;
      toolSettingsHoverHandler = null;
    }
  }

  // Função para registrar handler de configurações da ferramenta
  function registerToolSettings(handler) {
    toolSettingsHandler = handler;
  }

  // Função para registrar handler de pré-carregamento no hover
  function registerToolSettingsHover(handler) {
    toolSettingsHoverHandler = handler;
  }

  // Função para abrir configurações (chamada pelo ToolWrapper)
  function handleOpenSettings() {
    if (toolSettingsHandler && typeof toolSettingsHandler === 'function') {
      toolSettingsHandler();
    }
  }

  // Função para pré-carregar dados quando o mouse passa sobre a engrenagem
  function handleSettingsHover() {
    if (toolSettingsHoverHandler && typeof toolSettingsHoverHandler === 'function') {
      toolSettingsHoverHandler();
    }
  }

  // Função de logout
  async function handleLogout() {
    let dotsInterval = null;
    
    try {
      // Mostrar tela de loading com mensagens
      isLoading = true;
      
      // Aguardar tick para garantir que o Svelte atualize o DOM
      await tick();
      
      // Animar "Saindo do Portal" com três pontinhos
      dotsInterval = animateDots('Saindo do Portal', (message) => {
        loadingMessage = message;
      });
      
      // Aguardar um pouco antes de mostrar a segunda mensagem
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // Limpar intervalo anterior
      if (dotsInterval) {
        clearInterval(dotsInterval);
        dotsInterval = null;
      }
      
      // Animar "Volte Sempre" com três pontinhos
      dotsInterval = animateDots('Volte Sempre', (message) => {
        loadingMessage = message;
      });
      
      // Aguardar mais um pouco antes de fazer o logout
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // Limpar intervalo
      if (dotsInterval) {
        clearInterval(dotsInterval);
        dotsInterval = null;
      }
      
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
        // Limpar também credenciais salvas se existirem
        localStorage.removeItem('rememberMe');
        localStorage.removeItem('savedUsuario');
        localStorage.removeItem('savedSenha');
      }
      
      // Parar heartbeat
      stopHeartbeat();
      
      // Resetar estado - IMPORTANTE: resetar tudo antes de mudar a view
      isLoggedIn = false;
      currentUser = '';
      currentTool = null;
      toolSettingsHandler = null;
      toolSettingsHoverHandler = null;
      userTipo = 'user';
      
      // Limpar hash da URL se existir
      if (typeof window !== 'undefined') {
        window.location.hash = '';
      }
      
      // Aguardar um pouco antes de mostrar login
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Aguardar tick para garantir que o Svelte atualize o DOM
      await tick();
      
      // Definir view como login e ocultar loading
      currentView = 'login';
      isLoading = false;
      
      // Aguardar mais um tick para garantir renderização
      await tick();
      
      console.log('✅ Logout concluído:', {
        isLoggedIn,
        isLoading,
        currentView
      });
    } catch (err) {
      console.error('❌ Erro ao fazer logout:', err);
      // Em caso de erro, garantir que volte para login
      isLoggedIn = false;
      currentView = 'login';
      isLoading = false;
      // Limpar intervalo em caso de erro
      if (dotsInterval) {
        clearInterval(dotsInterval);
      }
    }
  }

  // Função para processar a URL e carregar ferramenta se necessário
  function processUrl() {
    if (typeof window === 'undefined') return;
    
    const hash = window.location.hash;
    // Formato esperado: #/tool-id
    if (hash && hash.startsWith('#/')) {
      const toolId = hash.substring(2); // Remove '#/'
      
      // Verificar se é um ID de ferramenta válido
      const tool = getToolById(toolId);
      if (tool && tool.available) {
        // Verificar se o usuário está logado
        if (typeof localStorage !== 'undefined') {
          const storedIsLoggedIn = localStorage.getItem('isLoggedIn') === 'true';
          const storedUser = localStorage.getItem('usuario');
          
          if (storedIsLoggedIn && storedUser) {
            // Usuário está logado, mostrar loading e depois carregar ferramenta
            setTimeout(() => {
              currentUser = storedUser;
              userTipo = localStorage.getItem('userTipo') || 'user';
              isLoggedIn = true;
              currentTool = toolId;
              currentView = 'tool';
              isToolInNewTab = true; // Marcar que está em nova aba (tem hash na URL)
              isLoading = false;
              startHeartbeat();
            }, 1500); // 1.5 segundos de loading
            return;
          }
        }
        
        // Se não está logado, mostrar loading primeiro, depois login
        isLoggedIn = false;
        setTimeout(() => {
          isLoading = false;
          currentView = 'login';
        }, 1500); // 1.5 segundos de loading
        return;
      }
    } else {
      // Sem hash, verificar se está logado para mostrar dashboard
      if (typeof localStorage !== 'undefined') {
        const storedIsLoggedIn = localStorage.getItem('isLoggedIn') === 'true';
        const storedUser = localStorage.getItem('usuario');
        
        if (storedIsLoggedIn && storedUser) {
          // Usuário está logado, mostrar loading e depois carregar dashboard
          setTimeout(() => {
            currentUser = storedUser;
            userTipo = localStorage.getItem('userTipo') || 'user';
            isLoggedIn = true;
            currentView = 'dashboard';
            isToolInNewTab = false; // Dashboard não está em nova aba
            isLoading = false;
            startHeartbeat();
          }, 1500); // 1.5 segundos de loading
        } else {
          // Não está logado, mostrar loading primeiro, depois login
          setTimeout(() => {
            isLoading = false;
            currentView = 'login';
          }, 1500); // 1.5 segundos de loading
        }
      } else {
        // localStorage não disponível, mostrar loading primeiro, depois login
        setTimeout(() => {
          isLoading = false;
          currentView = 'login';
        }, 1500); // 1.5 segundos de loading
      }
    }
  }

  // Processar URL ao montar o componente
  import { onMount, onDestroy, tick } from 'svelte';
  onMount(async () => {
    // Aguardar um tick para garantir que o Loading seja renderizado primeiro
    await tick();
    
    // Processar URL após garantir que o Loading está visível
    processUrl();
    
    // Inicializar BroadcastChannel para comunicação entre abas
    if (typeof BroadcastChannel !== 'undefined') {
      broadcastChannel = new BroadcastChannel('dashboard-communication');
      
      // Listener para mensagens do BroadcastChannel
      const messageHandler = (event) => {
        if (event.data.type === 'dashboard-request') {
          // Se estamos no Dashboard, responder
          if (currentView === 'dashboard' && isLoggedIn) {
            broadcastChannel.postMessage({ type: 'dashboard-response' });
          }
        } else if (event.data.type === 'focus-dashboard') {
          // Se estamos no Dashboard, focar a janela
          if (currentView === 'dashboard' && isLoggedIn && typeof window !== 'undefined') {
            window.focus();
          }
        }
      };
      
      broadcastChannel.addEventListener('message', messageHandler);
    }
    
    // Listener para mudanças no hash (navegação manual)
    const handleHashChange = () => {
      processUrl();
    };
    
    window.addEventListener('hashchange', handleHashChange);
    
    return () => {
      if (broadcastChannel) {
        broadcastChannel.close();
        broadcastChannel = null;
      }
      window.removeEventListener('hashchange', handleHashChange);
    };
  });

</script>

<!-- Tela de Login -->
{#if !isLoggedIn && !isLoading}
  <Login onLoginSuccess={handleLoginSuccess} />
{:else if isLoading}
  <!-- Tela de Loading -->
  <Loading currentMessage={loadingMessage} />
{:else if isLoggedIn && currentView === 'dashboard'}
  <!-- Dashboard -->
  <Dashboard 
    currentUser={currentUser}
    onToolSelect={handleToolSelect}
    onLogout={handleLogout}
  />
{:else if isLoggedIn && currentView === 'tool'}
  <!-- Conteúdo Principal (Ferramenta) - Renderização Dinâmica -->
  {#if currentTool}
    {@const tool = getToolById(currentTool)}
    {#if tool && tool.component}
      <!-- Todas as ferramentas são renderizadas da mesma forma -->
      <ToolWrapper
        toolTitle={tool.title}
        onBackToDashboard={handleBackToDashboard}
        onOpenSettings={handleOpenSettings}
        onSettingsHover={handleSettingsHover}
        showSettingsButton={toolSettingsHandler !== null && tool.id !== 'analise-cobertura'}
      >
        <svelte:component this={tool.component} 
          currentUser={currentUser}
          userTipo={userTipo}
          onBackToDashboard={handleBackToDashboard}
          onSettingsRequest={registerToolSettings}
          onSettingsHover={registerToolSettingsHover}
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
