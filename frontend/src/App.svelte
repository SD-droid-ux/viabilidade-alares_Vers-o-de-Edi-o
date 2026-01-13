<script>
  import { onMount, tick } from 'svelte';
  import { Loader } from '@googlemaps/js-api-loader';
  import * as XLSX from 'xlsx';
  import html2canvas from 'html2canvas';
  import Login from './Login.svelte';
  import Config from './Config.svelte';
  import Loading from './Loading.svelte';
  import Dashboard from './Dashboard.svelte';
  import ToolWrapper from './components/ToolWrapper.svelte';
  import { toolsRegistry, getToolById } from './tools/toolsRegistry.js';

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

  let map;
  let googleMapsLoaded = false;
  let searchMode = 'address'; // 'address' ou 'coordinates'
  let addressInput = '';
  let coordinatesInput = '';
  let loading = false;
  let error = null;
  let showPopupInstructions = false; // Controla exibição de instruções de pop-up
  let markers = [];
  let clientMarker = null; // Marcador do cliente
  let clientInfoWindow = null; // InfoWindow do cliente
  let clientCoords = null; // Coordenadas do cliente
  let ctos = []; // CTOs encontradas
  
  // Filtrar apenas CTOs de rua (não prédios) para exibição nos boxes e lista
  $: ctosRua = ctos.filter(cto => !cto.is_condominio || cto.is_condominio === false);
  let routes = []; // Rotas desenhadas no mapa
  let routeData = []; // Dados das rotas (para edição) - armazena CTO associada e path original
  let editingRoutes = false; // Modo de edição de rotas (DEPRECADO - usar editingRouteIndex)
  let editingRouteIndex = null; // Índice da rota que está sendo editada (null = nenhuma)
  let routeEditInterval = null; // Intervalo para monitorar mudanças nas rotas editáveis
  let lastRoutePaths = new Map(); // Armazena os últimos paths conhecidos de cada rota
  let selectedRouteIndex = null; // Índice da rota selecionada (para mostrar popup)
  let routePopupPosition = { x: 0, y: 0 }; // Posição do popup de rota
  let isDraggingRoutePopup = false; // Controla se o popup está sendo arrastado
  let dragOffset = { x: 0, y: 0 }; // Offset do mouse ao iniciar o arrasto
  let loadingCTOs = false; // Loading específico para busca de CTOs
  // REMOVIDO: ctosData não é mais necessário - buscamos CTOs sob demanda via API
  let baseDataExists = true; // Indica se a base de dados foi carregada com sucesso

  // Dados do endereço do cliente (para pré-preencher formulário)
  let clientAddressData = {
    cidade: '',
    enderecoCompleto: '',
    numero: '',
    cep: ''
  };

  // Modal e formulário de relatório
  let showReportModal = false;
  let generatingPDF = false; // Estado para controlar geração do PDF
  let mapPreviewImage = '';
  let capturingMap = false; // Estado para mostrar loading durante captura
  let reportForm = {
    numeroALA: '',
    cidade: '',
    enderecoCompleto: '',
    numeroEndereco: '',
    cep: '',
    tabulacaoFinal: '',
    projetista: ''
  };
  let reportFormErrors = {};
  let currentVIALA = ''; // VI ALA atual do PDF sendo gerado

  // Lista de projetistas salvos
  let projetistasList = [];
  let showAddProjetistaModal = false;
  let newProjetistaName = '';
  let showSettingsModal = false;
  
  // Lista de tabulações finais
  let tabulacoesList = [
    'Aprovado Com Portas',
    'Aprovado Com Alívio de Rede/Cleanup',
    'Aprovado Prédio Não Cabeado',
    'Aprovado - Endereço não Localizado',
    'Fora da Área de Cobertura'
  ];
  let showAddTabulacaoModal = false;
  let newTabulacaoName = '';

  // Estado para tooltips de informação
  let showInfoEquipamentos = false;
  let showInfoPortas = false;

  // Estado de autenticação
  let isLoggedIn = false;
  let currentUser = '';
  let userTipo = 'user'; // Tipo de usuário: 'admin' ou 'user'
  let isLoading = false;
  let loadingMessage = '';
  let heartbeatInterval = null;
  let currentView = 'dashboard'; // 'dashboard' ou 'tool' (ferramenta específica)
  let currentTool = null; // ID da ferramenta atual
  
  // Estados para modal de trocar senha
  let showChangePasswordModal = false;
  let newPassword = '';
  let confirmPassword = '';
  let showChangePassword = false;
  let showConfirmPassword = false;
  let changePasswordError = '';
  let changePasswordSuccess = false;
  let newUserName = '';
  let changeUserNameError = '';
  let changeUserNameSuccess = false;

  // Substitua pela sua chave do Google Maps
  const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || 'SUA_CHAVE_AQUI';

  // Função para calcular distância geodésica (linha reta) em metros
  // Usa a fórmula de Haversine
  function calculateGeodesicDistance(lat1, lng1, lat2, lng2) {
    const R = 6371000; // Raio da Terra em metros
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = 
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c; // Distância em metros
    return distance;
  }

  // Função para aplicar offset lateral a uma rota para evitar sobreposição
  // Desloca a rota perpendicularmente à direção média, baseado no índice
  // IMPORTANTE: O primeiro ponto (centro da CTO) e o último ponto (cliente) NÃO são deslocados
  function applyRouteOffset(path, routeIndex) {
    if (path.length < 2) return path;
    
    // Guardar o primeiro ponto (centro exato da CTO) e o último ponto (cliente) - não serão deslocados
    const ctoCenter = path[0];
    const clientCenter = path[path.length - 1];
    
    // Se houver apenas 2 pontos (CTO e cliente), não aplicar offset
    if (path.length === 2) {
      return path;
    }
    
    // Calcular direção média da rota (usando primeiro e último ponto)
    const startPoint = path[0];
    const endPoint = path[path.length - 1];
    
    // Calcular azimute (direção) em radianos usando fórmula de Haversine
    const lat1 = startPoint.lat * Math.PI / 180;
    const lat2 = endPoint.lat * Math.PI / 180;
    const dLon = (endPoint.lng - startPoint.lng) * Math.PI / 180;
    
    const y = Math.sin(dLon) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
    const bearing = Math.atan2(y, x);
    
    // Calcular direção perpendicular (90 graus à direita)
    const perpendicularBearing = bearing + (Math.PI / 2);
    
    // Offset em metros: -4, -2, 0, 2, 4 (para rotas 0, 1, 2, 3, 4)
    // Isso cria uma distribuição simétrica: 2 rotas de cada lado, 1 no centro
    const offsetMeters = (routeIndex - 2) * 2;
    
    // Converter offset de metros para graus
    // Raio da Terra em metros
    const earthRadiusMeters = 6371000;
    const offsetRadians = offsetMeters / earthRadiusMeters;
    
    // Calcular offset em latitude e longitude
    const offsetLat = offsetRadians * Math.cos(perpendicularBearing) * (180 / Math.PI);
    const offsetLng = offsetRadians * Math.sin(perpendicularBearing) * (180 / Math.PI) / Math.cos(lat1);
    
    // Aplicar offset APENAS aos pontos intermediários (não ao primeiro nem ao último)
    return path.map((point, index) => {
      if (index === 0) {
        // Manter o primeiro ponto exatamente no centro da CTO
        return { lat: ctoCenter.lat, lng: ctoCenter.lng };
      }
      if (index === path.length - 1) {
        // Manter o último ponto exatamente no cliente
        return { lat: clientCenter.lat, lng: clientCenter.lng };
      }
      // Aplicar offset apenas aos pontos intermediários
      return {
        lat: point.lat + offsetLat,
        lng: point.lng + offsetLng
      };
    });
  }

  // Função para filtrar segmentos muito longos da rota (indicam ruas não mapeadas)
  // Quando detecta segmentos muito longos, mantém apenas os pontos principais
  // Isso evita que a rota siga pontos que cortam terrenos quando a rua não está mapeada
  // IMPORTANTE: Sempre preserva o primeiro ponto (CTO) e o último ponto (cliente)
  function filterLongSegments(path, maxSegmentLength = 100) {
    if (path.length < 2) return path;
    
    // Sempre manter o primeiro ponto (CTO) e o último ponto (cliente)
    const firstPoint = path[0];
    const lastPoint = path[path.length - 1];
    
    // Se houver apenas 2 pontos, retornar como está
    if (path.length === 2) {
      return path;
    }
    
    const filteredPath = [firstPoint]; // Sempre manter o primeiro ponto (CTO)
    
    // Processar apenas os pontos intermediários (não o primeiro nem o último)
    for (let i = 1; i < path.length - 1; i++) {
      const prevPoint = filteredPath[filteredPath.length - 1];
      const currentPoint = path[i];
      
      // Calcular distância entre o último ponto filtrado e o ponto atual
      const segmentDistance = calculateGeodesicDistance(
        prevPoint.lat,
        prevPoint.lng,
        currentPoint.lat,
        currentPoint.lng
      );
      
      // Se o segmento é muito longo (mais de maxSegmentLength metros), indica possível rua não mapeada
      // Nesse caso, manter apenas o ponto atual (pular pontos intermediários que cortam terreno)
      if (segmentDistance > maxSegmentLength) {
        // Adicionar o ponto atual (ponto após o segmento longo)
        filteredPath.push(currentPoint);
      } else {
        // Segmento normal (rua mapeada), manter todos os pontos
        filteredPath.push(currentPoint);
      }
    }
    
    // Sempre adicionar o último ponto (cliente) no final
    filteredPath.push(lastPoint);
    
    return filteredPath;
  }

  // Função para calcular distância REAL usando Directions API (ruas)
  function calculateRealRouteDistance(originLat, originLng, destLat, destLng) {
    return new Promise((resolve, reject) => {
      const directionsService = new google.maps.DirectionsService();

      directionsService.route(
        {
          origin: { lat: originLat, lng: originLng },
          destination: { lat: destLat, lng: destLng },
          travelMode: google.maps.TravelMode.WALKING, // Modo de caminhada para distância real
          unitSystem: google.maps.UnitSystem.METRIC,
          region: 'BR', // Melhorar resultados para o Brasil
          provideRouteAlternatives: false, // Não calcular rotas alternativas (otimização)
          avoidHighways: true // Para modo de caminhada, evitar rodovias
        },
        (result, status) => {
          if (status === 'OK' && result.routes && result.routes.length > 0) {
            const route = result.routes[0];
            let totalDistance = 0;

            // Priorizar cálculo usando overview_path (geometria completa da rota) para maior precisão
            if (route.overview_path && route.overview_path.length > 1) {
              // Calcular distância somando segmentos entre pontos consecutivos do overview_path
              // Isso fornece maior precisão porque usa a geometria exata da rota
              for (let i = 0; i < route.overview_path.length - 1; i++) {
                const point1 = route.overview_path[i];
                const point2 = route.overview_path[i + 1];
                totalDistance += calculateGeodesicDistance(
                  point1.lat(),
                  point1.lng(),
                  point2.lat(),
                  point2.lng()
                );
              }
              
              // Adicionar distância do ponto inicial até o primeiro ponto do overview_path
              totalDistance += calculateGeodesicDistance(
                originLat,
                originLng,
                route.overview_path[0].lat(),
                route.overview_path[0].lng()
              );
              
              // Adicionar distância do último ponto do overview_path até o destino
              const lastPoint = route.overview_path[route.overview_path.length - 1];
              totalDistance += calculateGeodesicDistance(
                lastPoint.lat(),
                lastPoint.lng(),
                destLat,
                destLng
              );
            } else {
              // Fallback: usar distância dos legs se overview_path não estiver disponível
              route.legs.forEach(leg => {
                totalDistance += leg.distance.value; // value está em metros
              });
            }

            resolve(totalDistance);
          } else {
            // Se não conseguir calcular rota, usar distância linear como fallback
            let errorMessage = 'Não foi possível calcular rota real, usando distância linear.';
            switch (status) {
              case 'ZERO_RESULTS':
                errorMessage = 'Nenhuma rota encontrada, usando distância linear.';
                break;
              case 'NOT_FOUND':
                errorMessage = 'Origem ou destino não encontrados, usando distância linear.';
                break;
              case 'OVER_QUERY_LIMIT':
                errorMessage = 'Limite de requisições excedido, usando distância linear.';
                break;
              case 'REQUEST_DENIED':
                errorMessage = 'Requisição negada, usando distância linear.';
                break;
              case 'INVALID_REQUEST':
                errorMessage = 'Requisição inválida, usando distância linear.';
                break;
              default:
                errorMessage = `Erro ao calcular rota (Status: ${status}), usando distância linear.`;
            }
            console.warn(`⚠️ ${errorMessage}`);
            const linearDistance = calculateGeodesicDistance(originLat, originLng, destLat, destLng);
            resolve(linearDistance);
          }
        }
      );
    });
  }

  // Função para verificar/criar base_VI_ALA.xlsx
  async function ensureVIALABase() {
    try {
      const response = await fetch(getApiUrl('/api/vi-ala/ensure-base'));
      if (!response.ok) {
        console.warn('Aviso: Não foi possível verificar/criar base VI ALA');
        return false;
      }
      const result = await response.json();
      if (result.success) {
        console.log('✅ Base VI ALA verificada/criada com sucesso');
        return true;
      }
      return false;
    } catch (err) {
      console.warn('Aviso: Erro ao verificar/criar base VI ALA:', err);
      return false;
    }
  }

  // Função para verificar se a base de dados está disponível (nova abordagem - não carrega tudo)
  async function checkBaseAvailable() {
    try {
      // Verificar se o Supabase está disponível fazendo uma busca simples
      const testLat = -23.5505; // Coordenada de teste (São Paulo)
      const testLng = -46.6333;
      const response = await fetch(getApiUrl(`/api/ctos/nearby?lat=${testLat}&lng=${testLng}&radius=1000`));
      if (response.ok) {
        baseDataExists = true;
        return true;
      }
      baseDataExists = false;
      return false;
    } catch (err) {
      console.warn('Aviso: Não foi possível verificar base de dados:', err.message);
      baseDataExists = false;
      return false;
    }
  }

  // Função para extrair componentes do endereço
  function extractAddressComponents(geocodeResult) {
    const components = geocodeResult.address_components || [];
    const formattedAddress = geocodeResult.formatted_address || '';

    const cityComponent = components.find(c => 
      c.types.includes('locality') || c.types.includes('administrative_area_level_2')
    );
    const postalCodeComponent = components.find(c => c.types.includes('postal_code'));
    const streetNumberComponent = components.find(c => c.types.includes('street_number'));

    clientAddressData = {
      cidade: cityComponent?.long_name || '',
      enderecoCompleto: formattedAddress,
      numero: streetNumberComponent?.long_name || '',
      cep: postalCodeComponent?.long_name || ''
    };

    if (showReportModal) {
      reportForm.cidade = clientAddressData.cidade;
      reportForm.enderecoCompleto = clientAddressData.enderecoCompleto;
      reportForm.numeroEndereco = clientAddressData.numero;
      reportForm.cep = clientAddressData.cep;
    }
  }

  // Função para determinar a cor do marcador baseada na porcentagem de ocupação (pct_ocup)
  function getCTOColor(pctOcup) {
    // Converter para número e tratar valores inválidos
    const porcentagem = parseFloat(pctOcup) || 0;

    // Se for abaixo de 0% ou acima de 100%, retorna vermelho
    if (porcentagem < 0 || porcentagem > 100) {
      return '#F44336'; // Vermelho
    }

    // 0% - 49,99% = Verde
    if (porcentagem >= 0 && porcentagem < 50) {
      return '#4CAF50'; // Verde
    }
    // 50,00% - 79,99% = Laranja
    else if (porcentagem >= 50 && porcentagem < 80) {
      return '#FF9800'; // Laranja
    }
    // 80,00% - 100% = Vermelho
    else {
      return '#F44336'; // Vermelho
    }
  }

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
    
    // Inicialização específica por ferramenta
    if (toolId === 'viabilidade-alares') {
      // Carregar a ferramenta de Viabilidade
      // Mostrar loading enquanto carrega a ferramenta
      isLoading = true;
      
      try {
        // Etapa 1: Carregando Mapa
        loadingMessage = 'Carregando Mapa';
        await loadGoogleMaps();
        
        // Pequeno delay para visualização
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Etapa 2: Verificando Base de dados
        loadingMessage = 'Verificando Base de dados';
        baseDataExists = true; // Resetar estado
        try {
          await checkBaseAvailable();
        } catch (err) {
          console.warn('Aviso: Não foi possível verificar base de dados:', err.message);
          baseDataExists = false;
        }
        
        // Pequeno delay para visualização
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Etapa 3: Carregando ambiente Virtual
        loadingMessage = 'Carregando ambiente Virtual';
        loadProjetistas();
        await loadTabulacoes();
        
        // Pequeno delay para visualização
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Etapa 4: Ajuste Finais
        loadingMessage = 'Ajuste Finais';
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Etapa 5: Abrindo Ferramenta Virtual
        loadingMessage = 'Abrindo Ferramenta Virtual';
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Tudo carregado
        isLoading = false;
        
        // Aguardar o DOM atualizar antes de inicializar o mapa
        await tick();
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Agora inicializar o mapa após o elemento estar no DOM
        initMap();
      } catch (err) {
        console.error('Erro ao inicializar aplicação:', err);
        error = 'Erro ao inicializar aplicação: ' + err.message;
        isLoading = false;
        
        // Tentar inicializar o mapa mesmo com erro
        await tick();
        await new Promise(resolve => setTimeout(resolve, 100));
        initMap();
      }
    }
    // Outras ferramentas podem ter suas próprias inicializações aqui
  }

  // Função para voltar ao Dashboard
  function handleBackToDashboard() {
    currentView = 'dashboard';
    currentTool = null;
    // Limpar estado da ferramenta se necessário
    if (map) {
      // Limpar mapa e marcadores
      markers.forEach(marker => marker.setMap(null));
      markers = [];
      if (clientMarker) {
        clientMarker.setMap(null);
        clientMarker = null;
      }
      if (clientInfoWindow) {
        clientInfoWindow.close();
        clientInfoWindow = null;
      }
      routes.forEach(route => route.setMap(null));
      routes = [];
      routeData = [];
      ctos = [];
      clientCoords = null;
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
      // Limpar dados do mapa
      if (map) {
        markers.forEach(marker => {
          if (marker) marker.setMap(null);
        });
        routes.forEach(route => {
          if (route) route.setMap(null);
        });
        markers = [];
        routes = [];
        ctos = [];
        clientMarker = null;
        clientCoords = null;
      }
    } catch (err) {
      console.error('Erro ao fazer logout:', err);
    }
  }

  // Função para abrir modal de trocar senha
  function openChangePasswordModal() {
    showChangePasswordModal = true;
    newPassword = '';
    confirmPassword = '';
    changePasswordError = '';
    changePasswordSuccess = false;
    showChangePassword = false;
    showConfirmPassword = false;
    newUserName = currentUser || '';
    changeUserNameError = '';
    changeUserNameSuccess = false;
  }

  // Função para fechar modal de trocar senha
  function closeChangePasswordModal() {
    showChangePasswordModal = false;
    newPassword = '';
    confirmPassword = '';
    changePasswordError = '';
    changePasswordSuccess = false;
    showChangePassword = false;
    showConfirmPassword = false;
    newUserName = '';
    changeUserNameError = '';
    changeUserNameSuccess = false;
  }

  // Função para trocar senha do usuário atual
  async function changeUserPassword() {
    changePasswordError = '';
    changePasswordSuccess = false;
    
    if (!newPassword || !newPassword.trim()) {
      changePasswordError = 'Nova senha é obrigatória';
      return;
    }
    
    if (newPassword.trim().length < 4) {
      changePasswordError = 'A senha deve ter pelo menos 4 caracteres';
      return;
    }
    
    if (newPassword !== confirmPassword) {
      changePasswordError = 'As senhas não coincidem';
      return;
    }
    
    try {
      const response = await fetch(getApiUrl(`/api/projetistas/${encodeURIComponent(currentUser)}/password`), {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          senha: newPassword.trim()
        }),
      });

      const data = await response.json();

      if (data.success) {
        changePasswordSuccess = true;
        changePasswordError = '';
        // Fechar modal após sucesso
        setTimeout(() => {
          closeChangePasswordModal();
        }, 2000);
      } else {
        changePasswordError = data.error || 'Erro ao alterar senha';
      }
    } catch (err) {
      console.error('Erro ao alterar senha:', err);
      changePasswordError = 'Erro ao conectar com o servidor. Tente novamente.';
    }
  }

  // Função para alterar nome do usuário atual
  async function changeUserName() {
    changeUserNameError = '';
    changeUserNameSuccess = false;
    
    if (!newUserName || !newUserName.trim()) {
      changeUserNameError = 'Novo nome é obrigatório';
      return;
    }
    
    if (newUserName.trim().length < 2) {
      changeUserNameError = 'O nome deve ter pelo menos 2 caracteres';
      return;
    }
    
    if (newUserName.trim().toLowerCase() === currentUser.toLowerCase()) {
      changeUserNameError = 'O novo nome deve ser diferente do nome atual';
      return;
    }
    
    try {
      const response = await fetch(getApiUrl(`/api/projetistas/${encodeURIComponent(currentUser)}/name`), {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          novoNome: newUserName.trim()
        }),
      });

      const data = await response.json();

      if (data.success) {
        changeUserNameSuccess = true;
        changeUserNameError = '';
        
        // Atualizar currentUser e localStorage
        const oldUser = currentUser;
        currentUser = data.novoNome;
        
        // Atualizar localStorage
        const storedUser = localStorage.getItem('currentUser');
        if (storedUser) {
          localStorage.setItem('currentUser', data.novoNome);
        }
        
        // Atualizar também o 'usuario' no localStorage se existir
        const storedUsuario = localStorage.getItem('usuario');
        if (storedUsuario) {
          localStorage.setItem('usuario', data.novoNome);
        }
        
        
        // Fechar modal após sucesso
        setTimeout(() => {
          closeChangePasswordModal();
        }, 2000);
      } else {
        changeUserNameError = data.error || 'Erro ao alterar nome';
      }
    } catch (err) {
      console.error('Erro ao alterar nome:', err);
      changeUserNameError = 'Erro ao conectar com o servidor. Tente novamente.';
    }
  }

  onMount(async () => {
    // Verificar se já está logado
    try {
      const savedLogin = localStorage.getItem('isLoggedIn');
      if (savedLogin === 'true') {
        localStorage.removeItem('isLoggedIn');
        localStorage.removeItem('usuario');
        localStorage.removeItem('userTipo');
        isLoggedIn = false;
        currentUser = '';
        userTipo = 'user';
      } else {
        isLoggedIn = false;
        currentUser = '';
        userTipo = 'user';
      }
    } catch (err) {
      console.error('Erro ao verificar login:', err);
      isLoggedIn = false;
      currentUser = '';
    }

    // Se não estiver logado, não inicializar o mapa ainda
    if (!isLoggedIn) {
      return;
    }

    try {
      await loadGoogleMaps();
      initMap();
      // Verificar base de dados (não carrega tudo - apenas verifica disponibilidade)
      baseDataExists = true; // Resetar estado
      try {
        await checkBaseAvailable();
      } catch (err) {
        console.warn('Aviso: Não foi possível verificar base de dados:', err.message);
        baseDataExists = false;
        // Não definir error aqui para não bloquear o app
        // O erro será mostrado apenas quando tentar buscar CTOs
      }
      // Carregar lista de projetistas do localStorage
      loadProjetistas();
      // Carregar lista de tabulações
      await loadTabulacoes();
    } catch (err) {
      console.error('Erro ao inicializar aplicação:', err);
      error = 'Erro ao inicializar aplicação: ' + err.message;
    }
  });

  // Função para carregar projetistas da API ou localStorage
  async function loadProjetistas() {
    try {
      const response = await fetch(getApiUrl('/api/projetistas'));
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          projetistasList = data.projetistas || [];
          // Sincronizar com localStorage
          try {
            localStorage.setItem('projetistasList', JSON.stringify(projetistasList));
          } catch (err) {
            console.error('Erro ao sincronizar localStorage:', err);
          }
          return;
        }
      }
    } catch (err) {
    }
    
    // Fallback para localStorage se a API não estiver disponível
    try {
      const saved = localStorage.getItem('projetistasList');
      if (saved) {
        projetistasList = JSON.parse(saved);
      }
    } catch (localErr) {
      console.error('Erro ao carregar do localStorage:', localErr);
      projetistasList = [];
    }
  }

  // Função para adicionar novo projetista via API ou localmente
  async function addProjetista() {
    if (!newProjetistaName.trim()) {
      return;
    }
    
    const nome = newProjetistaName.trim();
    
    // Verificar se já existe
    if (projetistasList.includes(nome)) {
      reportForm.projetista = nome;
      newProjetistaName = '';
      showAddProjetistaModal = false;
      return;
    }
    
    let apiSuccess = false;
    
    try {
      // Tentar usar a API primeiro
      const response = await fetch(getApiUrl('/api/projetistas'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ nome }),
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          projetistasList = data.projetistas || [];
          apiSuccess = true;
        }
      }
    } catch (err) {
    }
    
    // Se a API não funcionou, adicionar localmente
    if (!apiSuccess) {
      projetistasList = [...projetistasList, nome];
      projetistasList.sort(); // Ordenar alfabeticamente
      
      // Salvar no localStorage como fallback
      try {
        localStorage.setItem('projetistasList', JSON.stringify(projetistasList));
      } catch (localErr) {
        console.error('Erro ao salvar no localStorage:', localErr);
      }
    }
    
    reportForm.projetista = nome;
    newProjetistaName = '';
    showAddProjetistaModal = false;
  }

  // Função para carregar tabulações da API ou localStorage
  async function loadTabulacoes() {
    try {
      const response = await fetch(getApiUrl('/api/tabulacoes'));
      if (response.ok) {
        const text = await response.text();
        if (text && text.trim() !== '') {
          const data = JSON.parse(text);
          if (data.success) {
            tabulacoesList = data.tabulacoes || tabulacoesList;
            // Sincronizar com localStorage
            try {
              localStorage.setItem('tabulacoesList', JSON.stringify(tabulacoesList));
            } catch (err) {
              console.error('Erro ao sincronizar localStorage:', err);
            }
            return;
          }
        }
      }
    } catch (err) {
    }

    // Fallback para localStorage se a API não estiver disponível
    try {
      const saved = localStorage.getItem('tabulacoesList');
      if (saved) {
        tabulacoesList = JSON.parse(saved);
      }
    } catch (localErr) {
      console.error('Erro ao carregar do localStorage:', localErr);
    }
  }

  // Função para abrir modal de adicionar tabulação
  function openAddTabulacaoModal() {
    showAddTabulacaoModal = true;
    newTabulacaoName = '';
  }

  // Função para fechar modal de adicionar tabulação
  function closeAddTabulacaoModal() {
    showAddTabulacaoModal = false;
    newTabulacaoName = '';
  }

  // Função para adicionar nova tabulação
  async function addTabulacao() {
    if (!newTabulacaoName.trim()) {
      return;
    }
    
    const nome = newTabulacaoName.trim();
    
    // Verificar se já existe
    if (tabulacoesList.includes(nome)) {
      reportForm.tabulacaoFinal = nome;
      newTabulacaoName = '';
      showAddTabulacaoModal = false;
      return;
    }
    
    let apiSuccess = false;
    
    try {
      // Tentar usar a API primeiro
      const response = await fetch(getApiUrl('/api/tabulacoes'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ nome }),
      });
      
      if (response.ok) {
        const text = await response.text();
        if (text && text.trim() !== '') {
          const data = JSON.parse(text);
          if (data.success) {
            tabulacoesList = data.tabulacoes || tabulacoesList;
            apiSuccess = true;
          }
        }
      }
    } catch (err) {
    }
    
    // Se a API não funcionou, adicionar localmente
    if (!apiSuccess) {
      tabulacoesList = [...tabulacoesList, nome];
      tabulacoesList.sort(); // Ordenar alfabeticamente
      
      // Salvar no localStorage como fallback
      try {
        localStorage.setItem('tabulacoesList', JSON.stringify(tabulacoesList));
      } catch (localErr) {
        console.error('Erro ao salvar no localStorage:', localErr);
      }
    }

    reportForm.tabulacaoFinal = nome;
    newTabulacaoName = '';
    showAddTabulacaoModal = false;
  }

  // Função para abrir modal de adicionar projetista
  function openAddProjetistaModal() {
    showAddProjetistaModal = true;
    newProjetistaName = '';
  }

  // Função para fechar modal de adicionar projetista
  function closeAddProjetistaModal() {
    showAddProjetistaModal = false;
    newProjetistaName = '';
  }

  // Pré-carregar dados de configurações quando o usuário passa o mouse sobre a engrenagem
  let settingsDataPreloaded = false;
  
  async function preloadSettingsData() {
    if (settingsDataPreloaded) return;
    
    try {
      // Pré-carregar dados em paralelo sem bloquear a UI
      Promise.all([
        fetch(getApiUrl('/api/projetistas')).then(r => r.text()).then(text => {
          if (text && text.trim() !== '') {
            try {
              const data = JSON.parse(text);
              if (data.success && data.projetistas) {
                localStorage.setItem('projetistasList', JSON.stringify(data.projetistas));
              }
            } catch (e) {}
          }
        }),
        fetch(getApiUrl('/api/tabulacoes')).then(r => r.text()).then(text => {
          if (text && text.trim() !== '') {
            try {
              const data = JSON.parse(text);
              if (data.success && data.tabulacoes) {
                localStorage.setItem('tabulacoesList', JSON.stringify(data.tabulacoes));
              }
            } catch (e) {}
          }
        }),
        fetch(getApiUrl('/api/base-last-modified')).then(r => r.text()).then(text => {
          if (text && text.trim() !== '') {
            try {
              const data = JSON.parse(text);
              if (data.success && data.lastModified) {
                localStorage.setItem('baseLastModified', data.lastModified);
              }
            } catch (e) {}
          }
        })
      ]).catch(() => {}); // Ignorar erros silenciosamente na pré-carga
      
      settingsDataPreloaded = true;
    } catch (err) {
      // Ignorar erros na pré-carga
    }
  }

  // Função para abrir tela de configurações
  function openSettingsModal(event) {
    if (event) {
      event.stopPropagation();
      event.preventDefault();
    }
    showSettingsModal = true;
  }

  // Função para fechar tela de configurações
  function closeSettingsModal() {
    showSettingsModal = false;
  }

  // Função para recarregar/verificar base após upload
  async function reloadCTOsData() {
    try {
      await checkBaseAvailable();
    } catch (err) {
      console.error('Erro ao verificar base:', err);
    }
  }

  async function loadGoogleMaps() {
    try {
      const loader = new Loader({
        apiKey: GOOGLE_MAPS_API_KEY,
        version: 'weekly',
        libraries: ['places', 'geometry']
      });

      await loader.load();
      googleMapsLoaded = true;
    } catch (err) {
      error = 'Erro ao carregar Google Maps: ' + err.message;
      console.error(err);
    }
  }

  function initMap() {
    if (!googleMapsLoaded) return;

    const mapElement = document.getElementById('map');
    if (!mapElement) return;

    map = new google.maps.Map(mapElement, {
      center: { lat: -23.5505, lng: -46.6333 }, // São Paulo como padrão
      zoom: 13,
      mapTypeControl: true,
      streetViewControl: true,
      fullscreenControl: true,
      scrollwheel: true, // Permite zoom com scroll do mouse
      gestureHandling: 'greedy' // Permite zoom direto com scroll, sem precisar Ctrl
    });
  }

  // Função auxiliar para converter geocoder callback em Promise
  function geocodeAddress(address) {
    return new Promise((resolve, reject) => {
      if (!google.maps || !google.maps.Geocoder) {
        reject(new Error('Google Maps Geocoder não está disponível'));
        return;
      }

      const geocoder = new google.maps.Geocoder();
      
      // Verificar se o geocoder foi criado corretamente
      if (!geocoder) {
        reject(new Error('Não foi possível criar o Geocoder'));
        return;
      }

      geocoder.geocode(
        { 
          address: address.trim(),
          region: 'br' // Priorizar resultados do Brasil
        },
        (results, status) => {
          
          if (status === 'OK' && results && results.length > 0) {
            // Retornar objeto com results e status para compatibilidade
            resolve({ results, status });
          } else if (status === 'ZERO_RESULTS') {
            reject(new Error('ZERO_RESULTS'));
          } else if (status === 'OVER_QUERY_LIMIT') {
            reject(new Error('Geocoding failed: OVER_QUERY_LIMIT'));
          } else if (status === 'REQUEST_DENIED') {
            reject(new Error('Geocoding failed: REQUEST_DENIED'));
          } else if (status === 'INVALID_REQUEST') {
            reject(new Error('Geocoding failed: INVALID_REQUEST'));
          } else {
            reject(new Error(`Geocoding failed: ${status}`));
          }
        }
      );
    });
  }

  // Função auxiliar para reverse geocoding (coordenadas -> endereço)
  function reverseGeocode(lat, lng) {
    return new Promise((resolve, reject) => {
      if (!google.maps || !google.maps.Geocoder) {
        reject(new Error('Google Maps Geocoder não está disponível'));
        return;
      }

      const geocoder = new google.maps.Geocoder();
      
      geocoder.geocode(
        { location: { lat, lng } },
        (results, status) => {
          if (status === 'OK' && results && results.length > 0) {
            // Retornar objeto com results e status para compatibilidade
            resolve({ results, status });
          } else {
            reject(new Error(`Reverse geocoding failed: ${status}`));
          }
        }
      );
    });
  }

  async function searchClientLocation() {
    loading = true;
    error = null;

    // Limpar marcadores anteriores
    if (map) {
      clearMap();
    }

    try {
      if (searchMode === 'address') {
        if (!addressInput || !addressInput.trim()) {
          error = 'Por favor, insira um endereço';
          loading = false;
          return;
        }

        // Verificar se o Google Maps está carregado
        if (!googleMapsLoaded || !google.maps || !google.maps.Geocoder) {
          error = 'Google Maps não está carregado. Aguarde alguns instantes e tente novamente.';
          loading = false;
          return;
        }

        const addressToSearch = addressInput.trim();

        // Usar Google Maps Geocoding para obter coordenadas
        let result;
        try {
          result = await geocodeAddress(addressToSearch);
        } catch (geocodeError) {
          console.error('Erro no geocoding:', geocodeError);
          throw geocodeError; // Re-throw para ser capturado pelo catch externo
        }

        // Verificar status da resposta
        if (!result || !result.results || result.results.length === 0) {
          error = 'Endereço não encontrado. Tente ser mais específico ou verifique se o endereço está correto.';
          loading = false;
          return;
        }

        // Procurar o resultado mais preciso (ROOFTOP ou RANGE_INTERPOLATED)
        let bestResult = result.results[0];
        for (const res of result.results) {
          if (res.geometry && res.geometry.location_type === 'ROOFTOP') {
            bestResult = res;
            break;
          } else if (res.geometry && res.geometry.location_type === 'RANGE_INTERPOLATED' && bestResult.geometry.location_type !== 'ROOFTOP') {
            bestResult = res;
          }
        }

        // Verificar se o resultado tem geometria válida
        if (!bestResult.geometry || !bestResult.geometry.location) {
          error = 'Endereço encontrado mas sem coordenadas válidas. Tente outro endereço.';
          loading = false;
          return;
        }

        const location = bestResult.geometry.location;
        clientCoords = {
          lat: location.lat(),
          lng: location.lng()
        };

        // Extrair componentes do endereço
        extractAddressComponents(bestResult);
      } else {
        // Parse coordenadas do formato "lat, lng"
        if (!coordinatesInput.trim()) {
          error = 'Por favor, insira as coordenadas';
          loading = false;
          return;
        }

        const coords = coordinatesInput.split(',').map(c => c.trim());

        if (coords.length !== 2) {
          error = 'Formato inválido. Use: latitude, longitude (ex: -22.5728462249402, -47.40101216301998)';
          loading = false;
          return;
        }

        const lat = parseFloat(coords[0]);
        const lng = parseFloat(coords[1]);

        if (isNaN(lat) || isNaN(lng)) {
          error = 'Por favor, insira coordenadas válidas';
          loading = false;
          return;
        }

        clientCoords = { lat, lng };
      }

      if (!clientCoords) {
        error = 'Não foi possível obter coordenadas';
        loading = false;
        return;
      }

      // Mover mapa para a localização exata com zoom maior
      map.setCenter(clientCoords);
      map.setZoom(18); // Zoom maior para mostrar localização exata

      // Criar ícone de casinha azul usando path SVG
      // Path de uma casa: triângulo (telhado) + retângulo (base)
      const housePath = 'M12 2L2 7v13h6v-6h8v6h6V7L12 2z';

      const houseIcon = {
        path: housePath,
        fillColor: '#4285F4',
        fillOpacity: 1,
        strokeColor: '#FFFFFF',
        strokeWeight: 2.5,
        scale: 1.8,
        anchor: new google.maps.Point(12, 22)
      };

      // Adicionar marcador (ícone de casinha azul) - ARRASTÁVEL
      const marker = new google.maps.Marker({
        position: clientCoords,
        map: map,
        title: 'Localização do Cliente (Arraste para ajustar)',
        icon: houseIcon,
        animation: google.maps.Animation.DROP,
        zIndex: 1000,
        optimized: false,
        draggable: true, // Permite arrastar o marcador
        cursor: 'move' // Cursor muda para "move" ao passar sobre o marcador
      });

      clientMarker = marker;
      markers.push(marker);

      async function getAddressFromCoords(lat, lng) {
        try {
          const result = await reverseGeocode(lat, lng);
          if (result.results && result.results.length > 0) {
            const bestResult = result.results[0];
            extractAddressComponents(bestResult);
            return bestResult.formatted_address;
          }
          return null;
        } catch (err) {
          console.error('Erro ao obter endereço:', err);
          return null;
        }
      }

      // Função para criar conteúdo do InfoWindow
      async function createInfoWindowContent(lat, lng, isManual = false) {
        const address = await getAddressFromCoords(lat, lng);

        let content = '<div style="padding: 8px;">';
        content += '<strong>Localização do Cliente</strong><br><br>';

        if (address) {
          content += `<strong>Endereço:</strong><br>${address}<br><br>`;
        }

        content += `<strong>Latitude/Longitude:</strong><br>${lat.toFixed(10)}, ${lng.toFixed(10)}<br><br>`;

        if (isManual) {
          content += '<small>Posição ajustada manualmente</small>';
        } else {
          content += '<small>Arraste para ajustar a posição</small>';
        }

        content += '</div>';
        return content;
      }

      // Criar InfoWindow inicial e salvar referência global
      clientInfoWindow = new google.maps.InfoWindow();

      // Carregar conteúdo inicial do InfoWindow
      createInfoWindowContent(clientCoords.lat, clientCoords.lng, false).then(content => {
        clientInfoWindow.setContent(content);
        clientInfoWindow.open(map, marker);
      });

      // Atualizar InfoWindow quando o marcador for arrastado
      marker.addListener('dragend', async (event) => {
        const newPosition = {
          lat: event.latLng.lat(),
          lng: event.latLng.lng()
        };

        // Atualizar coordenadas globais do cliente
        clientCoords = newPosition;

        // Atualizar coordenadas no input se estiver no modo coordenadas
        if (searchMode === 'coordinates') {
          coordinatesInput = `${newPosition.lat.toFixed(10)}, ${newPosition.lng.toFixed(10)}`;
        }

        // Atualizar endereço usando reverse geocoding
        try {
          const result = await reverseGeocode(newPosition.lat, newPosition.lng);

          if (result.results && result.results.length > 0) {
            const bestResult = result.results[0];
            extractAddressComponents(bestResult);

            // Atualizar o campo de endereço se estiver no modo endereço
            if (searchMode === 'address') {
              addressInput = bestResult.formatted_address || '';
            }
          }
        } catch (err) {
          console.error('Erro ao atualizar endereço:', err);
        }

        // Limpar CTOs e rotas anteriores quando o cliente move o marcador
        clearCTOs();

        // Atualizar conteúdo do InfoWindow com endereço e coordenadas
        const content = await createInfoWindowContent(newPosition.lat, newPosition.lng, true);
        clientInfoWindow.setContent(content);
        clientInfoWindow.open(map, marker);
      });

      marker.addListener('click', () => {
        clientInfoWindow.open(map, marker);
      });

      // Buscar CTOs automaticamente após localizar o cliente
      await searchCTOs();

    } catch (err) {
      console.error('❌ Erro completo:', err);
      console.error('❌ Mensagem de erro:', err.message);
      console.error('❌ Stack trace:', err.stack);
      
      // Verificar se é um erro de geocoding sem resultados
      if (err.message && err.message.includes('ZERO_RESULTS')) {
        error = 'Endereço não encontrado. Tente ser mais específico ou verifique se o endereço está correto.';
      } else if (err.message && err.message.includes('Geocoding failed')) {
        const status = err.message.replace('Geocoding failed: ', '');
        if (status === 'OVER_QUERY_LIMIT') {
          error = 'Limite de consultas excedido. Tente novamente mais tarde.';
        } else if (status === 'REQUEST_DENIED') {
          error = 'Erro de autenticação. Verifique a chave da API do Google Maps no arquivo .env';
        } else if (status === 'INVALID_REQUEST') {
          error = 'Endereço inválido. Verifique se o endereço está correto.';
        } else {
          error = `Erro ao buscar endereço (${status}). Verifique sua conexão e a chave da API.`;
        }
      } else if (err.message && err.message.includes('Google Maps Geocoder não está disponível')) {
        error = 'Google Maps não está carregado. Aguarde alguns instantes e tente novamente.';
      } else if (err.message && err.message.includes('Não foi possível criar o Geocoder')) {
        error = 'Erro ao inicializar o serviço de geocoding. Recarregue a página.';
      } else {
        error = `Erro ao localizar endereço: ${err.message || 'Erro desconhecido'}. Tente novamente.`;
      }
    } finally {
      loading = false;
    }
  }


  function clearMap() {
    // Fechar InfoWindow do cliente se estiver aberto
    if (clientInfoWindow) {
      clientInfoWindow.close();
      clientInfoWindow = null;
    }

    // Limpar todos os marcadores
    markers.forEach(marker => {
      marker.setMap(null);
    });
    markers = [];
    clientMarker = null;
    clientCoords = null;
    clearCTOs();
  }

  function clearCTOs() {
    // Limpar todas as rotas do mapa
    routes.forEach(route => {
      if (route && route.setMap) {
        route.setMap(null);
      }
    });
    routes = [];
    routeData = []; // Limpar dados de rotas também
    editingRoutes = false; // Desativar modo de edição ao limpar
    if (routeEditInterval) {
      clearInterval(routeEditInterval);
      routeEditInterval = null;
    }
    lastRoutePaths.clear();
    if (routeEditInterval) {
      clearInterval(routeEditInterval);
      routeEditInterval = null;
    }
    lastRoutePaths.clear();

    // Remover apenas marcadores de CTOs do mapa
    // NUNCA remover o marcador do cliente (clientMarker)
    markers.forEach(marker => {
      // Se não é o marcador do cliente, remover do mapa
      if (marker !== clientMarker && marker && marker.setMap) {
        marker.setMap(null);
      }
    });

    // Atualizar array de marcadores (manter apenas o do cliente)
    // Garantir que clientMarker sempre fica no array
    if (clientMarker) {
      markers = [clientMarker];
      // Garantir que o marcador do cliente ainda está no mapa
      if (map && clientMarker && typeof clientMarker.getMap === 'function') {
        if (clientMarker.getMap() === null) {
          clientMarker.setMap(map);
        }
      }
    } else {
      markers = [];
    }

    // Limpar array de CTOs
    ctos = [];
  }

  async function searchCTOs() {
    if (!clientCoords) {
      error = 'Por favor, localize o cliente primeiro';
      return;
    }

    loadingCTOs = true;
    error = null;

    // Limpar CTOs anteriores ANTES de buscar novas
    clearCTOs();

    // Pequeno delay para garantir que a limpeza visual foi feita
    await new Promise(resolve => setTimeout(resolve, 50));

    try {
      // ============================================
      // ETAPA 1: Buscar PRÉDIOS dentro de 100m (OTIMIZAÇÃO: reduzido de 250m para melhor performance)
      // ============================================
      console.log(`🏢 [Frontend] ETAPA 1: Buscando PRÉDIOS próximos de (${clientCoords.lat}, ${clientCoords.lng}) dentro de 100m...`);
      
      const prediosResponse = await fetch(getApiUrl(`/api/condominios/nearby?lat=${clientCoords.lat}&lng=${clientCoords.lng}&radius=100`));
      
      let predios = [];
      if (prediosResponse.ok) {
        const prediosData = await prediosResponse.json();
        if (prediosData.success && prediosData.condominios) {
          predios = prediosData.condominios
            .filter(p => p.distancia_metros <= 100)
            .map(p => ({
              nome: p.nome_predio || 'Prédio',
              latitude: parseFloat(p.latitude),
              longitude: parseFloat(p.longitude),
              is_condominio: true,
              condominio_data: p,
              status_cto_condominio: p.status_cto || null,
              ctos_internas: p.ctos_internas || [], // CTOs internas do prédio
              distancia_metros: p.distancia_metros,
              distancia_km: Math.round((p.distancia_metros / 1000) * 1000) / 1000,
              distancia_real: p.distancia_metros,
              // Campos vazios para prédios (não são CTOs)
              vagas_total: 0,
              clientes_conectados: 0,
              pct_ocup: 0,
              cidade: '',
              pop: '',
              id: ''
            }));
          
          console.log(`✅ [Frontend] ${predios.length} prédios encontrados dentro de 100m`);
          
          // Adicionar prédios imediatamente ao array (sem calcular rotas)
          if (predios.length > 0) {
            ctos = [...predios];
            // Desenhar prédios IMEDIATAMENTE (sem esperar CTOs)
            await drawRoutesAndMarkers();
          }
        }
      }
      
      // ============================================
      // ETAPA 2: Buscar CTOs dentro de 250m
      // ============================================
      console.log(`🔍 [Frontend] ETAPA 2: Buscando CTOs próximas de (${clientCoords.lat}, ${clientCoords.lng})...`);
      
      const response = await fetch(getApiUrl(`/api/ctos/nearby?lat=${clientCoords.lat}&lng=${clientCoords.lng}&radius=250`));
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Erro HTTP ${response.status}`);
      }
      
      const data = await response.json();
      
      if (!data.success || !data.ctos || data.ctos.length === 0) {
        // Se não há CTOs mas há prédios, está OK
        if (predios.length > 0) {
          loadingCTOs = false;
          return;
        }
        error = 'Nenhuma CTO encontrada próxima ao endereço';
        loadingCTOs = false;
        return;
      }
      
      // Filtrar apenas CTOs dentro de 250m
      const validCTOs = data.ctos
        .filter(cto => cto.distancia_metros <= 250)
        .map(cto => ({
          ...cto,
          distancia_km: Math.round((cto.distancia_metros / 1000) * 1000) / 1000
        }));
      
      if (validCTOs.length === 0) {
        // Se não há CTOs mas há prédios, está OK
        if (predios.length > 0) {
          loadingCTOs = false;
          return;
        }
        error = 'Nenhuma CTO encontrada dentro de 250m de distância';
        loadingCTOs = false;
        return;
      }
      
      console.log(`✅ [Frontend] ${validCTOs.length} CTOs encontradas dentro de 250m`);
      
      // ============================================
      // ETAPA 3: Filtrar CTOs que NÃO estão em prédios
      // ============================================
      const ctosNormais = validCTOs.filter(cto => !cto.is_condominio || cto.is_condominio === false);
      
      if (ctosNormais.length === 0) {
        console.log(`ℹ️ [Frontend] Todas as CTOs encontradas são de prédios`);
        // Se todas são prédios, manter apenas os prédios já plotados
        loadingCTOs = false;
        return;
      }
      
      console.log(`✅ [Frontend] ${ctosNormais.length} CTOs normais (não são prédios) encontradas`);
      
      // ============================================
      // ETAPA 4: Calcular rotas APENAS para CTOs normais
      // ============================================
      // Buscar mais CTOs inicialmente (ex: 10-15) para garantir que temos 5 válidas após filtrar por distância real
      // Isso garante que mesmo que algumas fiquem fora de 250m real, ainda teremos 5 válidas
      const ctosToCheck = ctosNormais.slice(0, 15); // Buscar até 15 para garantir 5 válidas

      // OTIMIZAÇÃO: Calcular distâncias em paralelo (Promise.all)
      const distancePromises = ctosToCheck.map(async (cto) => {
        try {
          const realDistance = await calculateRealRouteDistance(
            clientCoords.lat,
            clientCoords.lng,
            cto.latitude,
            cto.longitude
          );

          // Filtrar apenas as que estão dentro de 250m REAL
          if (realDistance <= 250) {
            return {
              ...cto,
              distancia_metros: Math.round(realDistance * 100) / 100,
              distancia_km: Math.round((realDistance / 1000) * 1000) / 1000,
              distancia_real: realDistance
            };
          }
          return null;
        } catch (err) {
          console.error(`❌ Erro ao calcular distância real para ${cto.nome}:`, err);
          // Em caso de erro, manter a CTO com distância linear
          return {
            ...cto,
            distancia_real: cto.distancia_metros
          };
        }
      });

      // Aguardar todas as distâncias em paralelo
      const ctosWithRealDistance = (await Promise.all(distancePromises))
        .filter(cto => cto !== null);

      // ============================================
      // ETAPA 5: Combinar prédios + CTOs normais
      // ============================================
      // IMPORTANTE: Limitar a no máximo 5 CTOs de RUA (não contar prédios no limite)
      // Prédios são mostrados separadamente e não contam no limite de 5
      const ctosNormaisLimitadas = ctosWithRealDistance.slice(0, 5);
      
      // Combinar prédios (já plotados) + CTOs normais (com rotas)
      // Prédios não contam no limite de 5 CTOs
      const todasCTOs = [...predios, ...ctosNormaisLimitadas];
      
      if (todasCTOs.length === 0) {
        error = 'Nenhuma CTO ou prédio encontrado dentro de 250m de distância';
        loadingCTOs = false;
        return;
      }

      // Ordenar por distância (real para normais, linear para prédios)
      // Prédios sempre aparecem primeiro (sem distância real)
      todasCTOs.sort((a, b) => {
        // Se ambos são prédios, manter ordem original
        if (a.is_condominio && b.is_condominio) return 0;
        // Prédios sempre vêm primeiro
        if (a.is_condominio) return -1;
        if (b.is_condominio) return 1;
        // Para CTOs normais, ordenar por distância real
        const distA = a.distancia_real || a.distancia_metros || 0;
        const distB = b.distancia_real || b.distancia_metros || 0;
        return distA - distB;
      });

      // Atribuir ao array final (prédios + até 5 CTOs de rua)
      ctos = todasCTOs;
      
      // Desenhar rotas e marcadores
      // Prédios já foram plotados, agora plotar CTOs normais com rotas
      await drawRoutesAndMarkers();

    } catch (err) {
      error = err.message || 'Erro ao buscar CTOs';
      console.error(err);
    } finally {
      loadingCTOs = false;
    }
  }

  // Função para desenhar rota REAL usando Directions API
  // A rota parte da CTO até o cliente, seguindo exatamente as ruas
  async function drawRealRoute(cto, index) {
    return new Promise((resolve, reject) => {
      const directionsService = new google.maps.DirectionsService();

      // Parsear coordenadas da CTO com precisão (garantir que são números válidos)
      const ctoLat = parseFloat(cto.latitude);
      const ctoLng = parseFloat(cto.longitude);
      
      // Validar coordenadas
      if (isNaN(ctoLat) || isNaN(ctoLng)) {
        console.warn(`⚠️ CTO ${cto.nome} tem coordenadas inválidas para calcular rota`);
        reject(new Error('Coordenadas inválidas'));
        return;
      }

      // Calcular rota da CTO até o cliente (partindo da CTO)
      // IMPORTANTE: Usar coordenadas parseadas para garantir que sejam exatamente as mesmas do marcador
      directionsService.route(
        {
          origin: { lat: ctoLat, lng: ctoLng }, // Origem: CTO (coordenadas parseadas)
          destination: { lat: clientCoords.lat, lng: clientCoords.lng }, // Destino: Cliente
          travelMode: google.maps.TravelMode.WALKING, // Modo de caminhada para rota real
          unitSystem: google.maps.UnitSystem.METRIC,
          region: 'BR', // Melhorar resultados para o Brasil
          provideRouteAlternatives: false, // Não calcular rotas alternativas (otimização)
          avoidHighways: true // Para modo de caminhada, evitar rodovias
        },
        (result, status) => {
          if (status === 'OK' && result.routes && result.routes.length > 0) {
            const route = result.routes[0];
            const path = [];

            // Começar exatamente na CTO (conectado ao marcador)
            // IMPORTANTE: Usar as mesmas coordenadas parseadas usadas no marcador
            path.push({ lat: ctoLat, lng: ctoLng });

            // Usar overview_path da rota que já contém todos os pontos otimizados e detalhados
            // overview_path é a representação mais precisa da rota calculada pela API
            // Ele já segue exatamente as ruas com todos os detalhes necessários
            if (route.overview_path && route.overview_path.length > 0) {
              // overview_path já contém todos os pontos da rota, incluindo início e fim
              // É a forma mais precisa e confiável de obter a rota completa
              route.overview_path.forEach(point => {
                path.push({ lat: point.lat(), lng: point.lng() });
              });
            } else {
              // Fallback: usar steps.path se overview_path não estiver disponível
              if (route.legs && route.legs.length > 0) {
                route.legs.forEach((leg) => {
                  if (leg.steps && leg.steps.length > 0) {
                    leg.steps.forEach((step, stepIndex) => {
                      if (step.path && step.path.length > 0) {
                        step.path.forEach((point, pointIndex) => {
                          const lat = point.lat();
                          const lng = point.lng();
                          
                          // Adicionar todos os pontos, exceto o primeiro do primeiro step (já temos a CTO)
                          if (stepIndex === 0 && pointIndex === 0) {
                            return;
                          }
                          
                          path.push({ lat, lng });
                        });
                      }
                    });
                  }
                });
              }
            }

            // Terminar exatamente no cliente (conectado ao marcador da casinha)
            // IMPORTANTE: Garantir que o último ponto seja exatamente o cliente
            const lastPoint = { lat: clientCoords.lat, lng: clientCoords.lng };
            
            // Remover o último ponto se for muito próximo do cliente (para evitar duplicata)
            // e adicionar o ponto exato do cliente
            if (path.length > 0) {
              const secondLastPoint = path[path.length - 1];
              const distanceToClient = calculateGeodesicDistance(
                secondLastPoint.lat,
                secondLastPoint.lng,
                lastPoint.lat,
                lastPoint.lng
              );
              
              // Se o último ponto está muito próximo do cliente (menos de 1 metro), substituir
              // Caso contrário, adicionar o ponto do cliente
              if (distanceToClient < 1) {
                path[path.length - 1] = lastPoint;
              } else {
                path.push(lastPoint);
              }
            } else {
              // Se não houver pontos, adicionar pelo menos CTO e cliente
              path.push(lastPoint);
            }

            // GARANTIR que o primeiro ponto seja exatamente a CTO e o último seja o cliente
            // Isso corrige qualquer pequena diferença que a API possa ter
            if (path.length > 0) {
              path[0] = { lat: ctoLat, lng: ctoLng };
              path[path.length - 1] = { lat: clientCoords.lat, lng: clientCoords.lng };
            }

            // Validar se o path tem pontos válidos antes de desenhar
            if (path.length === 0) {
              console.warn(`⚠️ Rota para ${cto.nome} não retornou pontos válidos. Usando fallback.`);
              // Calcular cor da rota baseada na cor da CTO
              const routeColor = getCTOColor(cto.pct_ocup || 0);
              
              // Fallback: desenhar linha reta conectando os marcadores
              // Usar coordenadas parseadas para garantir alinhamento
              const fallbackPath = [
                { lat: ctoLat, lng: ctoLng },
                { lat: clientCoords.lat, lng: clientCoords.lng }
              ];
              
              // Aplicar offset lateral para evitar sobreposição
              const offsetFallbackPath = applyRouteOffset(fallbackPath, index);
              
              const routePolyline = new google.maps.Polyline({
                path: offsetFallbackPath,
                geodesic: true,
                strokeColor: routeColor, // Cor da rota igual à cor da CTO
                strokeOpacity: 0.6,
                strokeWeight: 4,
                map: map,
                zIndex: 500 + index
              });
              routes.push(routePolyline);
              resolve();
              return;
            }

            // NÃO filtrar segmentos longos - manter TODOS os pontos para máxima precisão
            // A rota deve seguir exatamente as ruas com todos os detalhes
            // Se houver segmentos longos, eles são parte da rota real e devem ser mantidos
            const filteredPath = path; // Manter todos os pontos sem filtragem

            // NÃO aplicar offset - usar a rota exata da API para máxima precisão
            // O offset estava distorcendo a rota e fazendo ela não chegar ao cliente corretamente
            // Se houver sobreposição de rotas, é melhor ter rotas precisas do que rotas deslocadas
            const offsetPath = filteredPath; // Usar path original sem offset

            // Calcular cor da rota baseada na cor da CTO
            const routeColor = getCTOColor(cto.pct_ocup || 0);
            
            // Desenhar Polyline usando TODOS os pontos detalhados SEM offset
            // IMPORTANTE: geodesic: false garante que a rota siga EXATAMENTE os pontos fornecidos
            // Isso faz com que a rota siga cada curva e mudança de direção das ruas
            const routePolyline = new google.maps.Polyline({
              path: offsetPath,
              geodesic: false, // CRÍTICO: false = seguir exatamente os pontos (não fazer linha reta entre eles)
              strokeColor: routeColor, // Cor da rota igual à cor da CTO
              strokeOpacity: 0.7,
              strokeWeight: 5, // Espessura aumentada para melhor visibilidade
              map: map,
              zIndex: 500 + index,
              editable: editingRoutes // Tornar editável se estiver no modo de edição
            });

            // Adicionar rota ao array ANTES de criar listeners para garantir índice correto
            routes.push(routePolyline);
            const actualRouteIndex = routes.length - 1; // Índice da rota no array routes
            
            // Armazenar dados da rota para edição
            routeData.push({
              polyline: routePolyline,
              ctoIndex: index, // Índice da CTO no array ctos
              routeIndex: actualRouteIndex, // Índice da rota no array routes (NOVO)
              cto: cto,
              originalPath: [...filteredPath] // Cópia do path original
            });

            // Adicionar listener de clique na rota para mostrar popup
            // Usar o índice correto da rota no array routes
            routePolyline.addListener('click', (event) => {
              handleRouteClick(actualRouteIndex, event);
            });

            // Adicionar listeners para salvar alterações quando a rota for editada
            // Usar ctoIndex (não routeIndex) para saveRouteEdit
            if (editingRouteIndex === actualRouteIndex) {
              routePolyline.addListener('set_at', () => {
                saveRouteEdit(index); // index é o ctoIndex
              });
              routePolyline.addListener('insert_at', () => {
                saveRouteEdit(index);
              });
              routePolyline.addListener('remove_at', () => {
                saveRouteEdit(index);
              });
            }
            resolve();
          } else {
            // Melhorar tratamento de erros com diferentes status codes
            let errorMessage = `Não foi possível desenhar rota real para ${cto.nome}.`;
            switch (status) {
              case 'ZERO_RESULTS':
                errorMessage = `Nenhuma rota encontrada para ${cto.nome}.`;
                break;
              case 'NOT_FOUND':
                errorMessage = `Origem ou destino não encontrados para ${cto.nome}.`;
                break;
              case 'OVER_QUERY_LIMIT':
                errorMessage = `Limite de requisições excedido ao calcular rota para ${cto.nome}.`;
                break;
              case 'REQUEST_DENIED':
                errorMessage = `Requisição negada ao calcular rota para ${cto.nome}.`;
                break;
              case 'INVALID_REQUEST':
                errorMessage = `Requisição inválida ao calcular rota para ${cto.nome}.`;
                break;
              default:
                errorMessage = `Erro ao calcular rota para ${cto.nome}. Status: ${status}`;
            }
            console.warn(`⚠️ ${errorMessage}`);
            
            // Calcular cor da rota baseada na cor da CTO
            const routeColor = getCTOColor(cto.pct_ocup || 0);
            
            // Fallback: desenhar linha reta conectando exatamente os marcadores
            const fallbackPath = [
              { lat: cto.latitude, lng: cto.longitude }, // Começa na CTO
              { lat: clientCoords.lat, lng: clientCoords.lng } // Termina no cliente
            ];
            
            // Aplicar offset lateral para evitar sobreposição
            const offsetFallbackPath = applyRouteOffset(fallbackPath, index);
            
            const routePolyline = new google.maps.Polyline({
              path: offsetFallbackPath,
              geodesic: true,
              strokeColor: routeColor, // Cor da rota igual à cor da CTO
              strokeOpacity: 0.6,
              strokeWeight: 4,
              map: map,
              zIndex: 500 + index
            });
            routes.push(routePolyline);
            resolve();
          }
        }
      );
    });
  }

  // Função para verificar mudanças nas rotas editáveis (usado como fallback)
  function checkRouteChanges() {
    if (editingRouteIndex === null) {
      return;
    }
    
    if (routes.length === 0) {
      return;
    }
    
    // Verificar apenas a rota que está sendo editada
    const routeIndex = editingRouteIndex;
    const route = routes[routeIndex];
    
    if (!route) {
      return;
    }
    
    if (!route.getPath) {
      return;
    }
    
    const routeInfo = routeData.find(rd => rd.polyline === route);
    if (!routeInfo) {
      return;
    }
    
    const ctoIndex = routeInfo.ctoIndex;
      
      try {
        const currentPath = route.getPath();
        if (!currentPath) {
          console.warn(`⏱️ getPath() retornou null/undefined para rota ${routeIndex} (CTO ${ctoIndex})`);
          return;
        }
        
        if (currentPath.getLength && currentPath.getLength() === 0) {
          console.warn(`⏱️ Path vazio para rota ${routeIndex} (CTO ${ctoIndex})`);
          return;
        }
        
        // Converter path para array - pode ser MVCArray ou array normal
        let pathArray = [];
        if (currentPath.forEach) {
          // É um MVCArray do Google Maps
          currentPath.forEach((p, idx) => {
            pathArray.push(p);
          });
        } else if (Array.isArray(currentPath)) {
          pathArray = currentPath;
        } else {
          // Tentar Array.from como fallback
          try {
            pathArray = Array.from(currentPath);
          } catch (e) {
            console.error(`⏱️ Erro ao converter path para array na rota ${routeIndex} (CTO ${ctoIndex}):`, e);
            return;
          }
        }
        
        // Filtrar pontos válidos e converter para string
        // Os pontos podem ser objetos google.maps.LatLng (com métodos lat()/lng()) ou objetos simples {lat, lng}
        const validPoints = pathArray.filter(p => {
          if (!p) return false;
          // Verificar se é objeto google.maps.LatLng (tem métodos)
          if (typeof p.lat === 'function' && typeof p.lng === 'function') return true;
          // Verificar se é objeto simples {lat, lng}
          if (typeof p.lat === 'number' && typeof p.lng === 'number') return true;
          return false;
        });
        
        if (validPoints.length === 0) {
          console.warn(`⏱️ Nenhum ponto válido encontrado na rota ${routeIndex} (CTO ${ctoIndex})`);
          console.warn(`  Path length: ${currentPath.getLength ? currentPath.getLength() : pathArray.length}`);
          console.warn(`  Primeiro ponto:`, pathArray[0]);
          console.warn(`  Tipo do primeiro ponto:`, typeof pathArray[0]);
          if (pathArray[0]) {
            console.warn(`  Propriedades do primeiro ponto:`, Object.keys(pathArray[0]));
            console.warn(`  p.lat:`, pathArray[0].lat, `(tipo: ${typeof pathArray[0].lat})`);
            console.warn(`  p.lng:`, pathArray[0].lng, `(tipo: ${typeof pathArray[0].lng})`);
          }
          return;
        }
        
        // Converter pontos para string, lidando com ambos os formatos
        const currentPathString = validPoints.map(p => {
          // Se tem métodos, chamar os métodos; senão, usar propriedades diretamente
          const lat = typeof p.lat === 'function' ? p.lat() : p.lat;
          const lng = typeof p.lng === 'function' ? p.lng() : p.lng;
          return `${lat.toFixed(6)},${lng.toFixed(6)}`;
        }).join('|');
        const lastPathString = lastRoutePaths.get(ctoIndex);
        
        // Se o path mudou, atualizar (só atualizar se já tiver um path anterior salvo)
        if (lastPathString === undefined) {
          // Primeira vez verificando esta rota, salvar o path inicial
          lastRoutePaths.set(ctoIndex, currentPathString);
          console.log(`  💾 Path inicial salvo para CTO ${ctoIndex} (${currentPathString.split('|').length} pontos)`);
        } else if (currentPathString !== lastPathString) {
          console.log(`🔄 Mudança detectada na rota da CTO ${ctoIndex} (verificação por intervalo)`);
          console.log(`  Path anterior: ${lastPathString.split('|').length} pontos`);
          console.log(`  Path atual: ${currentPathString.split('|').length} pontos`);
          lastRoutePaths.set(ctoIndex, currentPathString);
          saveRouteEdit(ctoIndex);
        }
      } catch (err) {
        console.error(`⏱️ Erro ao verificar mudanças na rota ${routeIndex} (CTO ${ctoIndex}):`, err);
      }
  }

  // Função para ativar/desativar modo de edição de rotas
  function toggleRouteEditing() {
    editingRoutes = !editingRoutes;
    console.log(`🔄 Modo de edição ${editingRoutes ? 'ATIVADO' : 'DESATIVADO'}. Total de rotas: ${routes.length}`);
    
    // Tornar todas as rotas editáveis ou não editáveis
    routes.forEach((route, routeIndex) => {
      if (route && route.setEditable) {
        route.setEditable(editingRoutes);
        console.log(`  ✓ Rota ${routeIndex} tornada ${editingRoutes ? 'editável' : 'não editável'}`);
        
        // Adicionar ou remover listeners quando entrar/sair do modo de edição
        if (editingRoutes) {
          // Encontrar o índice correto da CTO usando routeData
          const routeInfo = routeData.find(rd => rd.polyline === route);
          const ctoIndex = routeInfo ? routeInfo.ctoIndex : routeIndex;
          
          console.log(`  📍 Rota ${routeIndex} mapeada para CTO índice ${ctoIndex}`);
          
          // Salvar path inicial para comparação
          try {
            const initialPath = route.getPath();
            if (!initialPath) {
              console.warn(`  ⚠️ getPath() retornou null/undefined para CTO ${ctoIndex}`);
              return;
            }
            
            if (initialPath.getLength && initialPath.getLength() === 0) {
              console.warn(`  ⚠️ Path inicial vazio para CTO ${ctoIndex}`);
              return;
            }
            
            // Converter path para array - pode ser MVCArray ou array normal
            let initialPathArray = [];
            if (initialPath.forEach) {
              // É um MVCArray do Google Maps
              initialPath.forEach((p) => {
                initialPathArray.push(p);
              });
            } else if (Array.isArray(initialPath)) {
              initialPathArray = initialPath;
            } else {
              // Tentar Array.from como fallback
              try {
                initialPathArray = Array.from(initialPath);
              } catch (e) {
                console.warn(`  ⚠️ Erro ao converter path inicial para array para CTO ${ctoIndex}:`, e);
                return;
              }
            }
            
            // Filtrar pontos válidos (podem ser google.maps.LatLng ou objetos simples {lat, lng})
            const validInitialPoints = initialPathArray.filter(p => {
              if (!p) return false;
              // Verificar se é objeto google.maps.LatLng (tem métodos)
              if (typeof p.lat === 'function' && typeof p.lng === 'function') return true;
              // Verificar se é objeto simples {lat, lng}
              if (typeof p.lat === 'number' && typeof p.lng === 'number') return true;
              return false;
            });
            
            if (validInitialPoints.length === 0) {
              console.warn(`  ⚠️ Nenhum ponto válido no path inicial para CTO ${ctoIndex}`);
              console.warn(`    Path length: ${initialPath.getLength ? initialPath.getLength() : initialPathArray.length}`);
              console.warn(`    Primeiro ponto:`, initialPathArray[0]);
              if (initialPathArray[0]) {
                console.warn(`    Tipo: ${typeof initialPathArray[0]}, lat: ${initialPathArray[0].lat}, lng: ${initialPathArray[0].lng}`);
              }
              return;
            }
            
            // Converter pontos para string, lidando com ambos os formatos
            const initialPathString = validInitialPoints.map(p => {
              // Se tem métodos, chamar os métodos; senão, usar propriedades diretamente
              const lat = typeof p.lat === 'function' ? p.lat() : p.lat;
              const lng = typeof p.lng === 'function' ? p.lng() : p.lng;
              return `${lat.toFixed(6)},${lng.toFixed(6)}`;
            }).join('|');
            lastRoutePaths.set(ctoIndex, initialPathString);
            console.log(`  💾 Path inicial salvo para CTO ${ctoIndex} (${validInitialPoints.length} pontos válidos de ${initialPath.getLength()} total)`);
          } catch (err) {
            console.warn(`  ⚠️ Erro ao salvar path inicial para CTO ${ctoIndex}:`, err);
          }
          
          // Remover listeners antigos se existirem (evitar duplicatas)
          google.maps.event.clearListeners(route, 'set_at');
          google.maps.event.clearListeners(route, 'insert_at');
          google.maps.event.clearListeners(route, 'remove_at');
          
          // Criar funções wrapper para capturar o ctoIndex correto
          const handleSetAt = () => {
            console.log(`🎯 Evento 'set_at' disparado para rota ${routeIndex}, CTO ${ctoIndex}`);
            saveRouteEdit(ctoIndex);
          };
          
          const handleInsertAt = () => {
            console.log(`🎯 Evento 'insert_at' disparado para rota ${routeIndex}, CTO ${ctoIndex}`);
            saveRouteEdit(ctoIndex);
          };
          
          const handleRemoveAt = () => {
            console.log(`🎯 Evento 'remove_at' disparado para rota ${routeIndex}, CTO ${ctoIndex}`);
            saveRouteEdit(ctoIndex);
          };
          
          // Adicionar listeners para salvar alterações
          route.addListener('set_at', handleSetAt);
          route.addListener('insert_at', handleInsertAt);
          route.addListener('remove_at', handleRemoveAt);
          
          console.log(`  ✅ Listeners adicionados para rota ${routeIndex}`);
        } else {
          // Remover listeners ao sair do modo de edição
          google.maps.event.clearListeners(route, 'set_at');
          google.maps.event.clearListeners(route, 'insert_at');
          google.maps.event.clearListeners(route, 'remove_at');
          console.log(`  🗑️ Listeners removidos da rota ${routeIndex}`);
        }
      } else {
        console.warn(`  ⚠️ Rota ${routeIndex} não tem método setEditable`);
      }
    });
    
    // Iniciar verificação por intervalo como fallback (verifica a cada 500ms)
    if (editingRoutes && routes.length > 0) {
      if (routeEditInterval) {
        clearInterval(routeEditInterval);
      }
      let checkCount = 0;
      routeEditInterval = setInterval(() => {
        if (!editingRoutes) {
          // Se o modo foi desativado, o intervalo será limpo na função toggleRouteEditing
          return;
        }
        checkCount++;
        if (checkCount % 10 === 0) {
          console.log(`⏱️ Intervalo rodando... (verificação #${checkCount})`);
        }
        checkRouteChanges();
      }, 500);
      console.log(`  ⏱️ Intervalo de verificação iniciado (500ms) - verificando ${routes.length} rotas`);
    } else if (!editingRoutes && routeEditInterval) {
      clearInterval(routeEditInterval);
      routeEditInterval = null;
      console.log(`  🛑 Intervalo de verificação parado`);
    }
    
    console.log(`📊 RouteData:`, routeData.map(rd => ({ ctoIndex: rd.ctoIndex, ctoNome: rd.cto?.nome })));
  }

  // Função para lidar com clique em uma rota
  function handleRouteClick(routeIndex, event) {
    const routeInfo = routeData.find(rd => {
      const route = routes[routeIndex];
      return rd.polyline === route;
    });
    
    if (!routeInfo) {
      console.warn(`Rota ${routeIndex} não encontrada em routeData`);
      return;
    }
    
    selectedRouteIndex = routeIndex;
    
    // Posicionar popup próximo ao ponto de clique na tela
    if (event && event.domEvent) {
      const clickEvent = event.domEvent;
      // Usar coordenadas da viewport (tela) diretamente
      routePopupPosition = {
        x: clickEvent.clientX - 125, // Offset para centralizar o popup no cursor
        y: clickEvent.clientY - 50
      };
    } else if (event && event.latLng) {
      // Fallback: usar coordenadas do mapa se domEvent não estiver disponível
      const mapDiv = document.getElementById('map');
      if (mapDiv) {
        const mapRect = mapDiv.getBoundingClientRect();
        const projection = map.getProjection();
        const scale = Math.pow(2, map.getZoom());
        const worldCoordinate = projection.fromLatLngToPoint(event.latLng);
        const bounds = map.getBounds();
        const ne = bounds.getNorthEast();
        const sw = bounds.getSouthWest();
        const topRight = projection.fromLatLngToPoint(ne);
        const bottomLeft = projection.fromLatLngToPoint(sw);
        const scaleX = mapRect.width / (topRight.x - bottomLeft.x);
        const scaleY = mapRect.height / (topRight.y - bottomLeft.y);
        
        // Converter para coordenadas da viewport
        routePopupPosition = {
          x: mapRect.left + (worldCoordinate.x - bottomLeft.x) * scaleX - 125,
          y: mapRect.top + (worldCoordinate.y - bottomLeft.y) * scaleY - 50
        };
      }
    }
  }

  // Função para fechar o popup de rota
  function closeRoutePopup() {
    selectedRouteIndex = null;
    isDraggingRoutePopup = false;
    // Remover listeners globais se estiverem ativos
    document.removeEventListener('mousemove', handleGlobalDrag);
    document.removeEventListener('mouseup', handleGlobalStopDrag);
  }

  // Funções para arrastar o popup livremente pela tela
  function startDraggingRoutePopup(event) {
    event.preventDefault();
    isDraggingRoutePopup = true;
    const popup = event.currentTarget.closest('.route-popup');
    if (popup) {
      const rect = popup.getBoundingClientRect();
      // Usar coordenadas da viewport (tela)
      dragOffset.x = event.clientX - rect.left;
      dragOffset.y = event.clientY - rect.top;
      
      // Adicionar listeners globais para funcionar mesmo quando o mouse sair do popup
      document.addEventListener('mousemove', handleGlobalDrag);
      document.addEventListener('mouseup', handleGlobalStopDrag);
    }
  }

  // Função global para arrastar (chamada quando o mouse se move em qualquer lugar da tela)
  function handleGlobalDrag(event) {
    if (!isDraggingRoutePopup) return;
    event.preventDefault();
    
    // Calcular nova posição usando coordenadas da viewport (tela)
    const newX = event.clientX - dragOffset.x;
    const newY = event.clientY - dragOffset.y;
    
    // Permitir movimento livre pela tela toda
    routePopupPosition = {
      x: newX,
      y: newY
    };
  }

  // Função global para parar o arrasto
  function handleGlobalStopDrag() {
    if (isDraggingRoutePopup) {
      isDraggingRoutePopup = false;
      // Remover listeners globais
      document.removeEventListener('mousemove', handleGlobalDrag);
      document.removeEventListener('mouseup', handleGlobalStopDrag);
    }
  }

  function dragRoutePopup(event) {
    // Esta função ainda é chamada pelo evento local, mas o handleGlobalDrag faz o trabalho real
    handleGlobalDrag(event);
  }

  function stopDraggingRoutePopup() {
    handleGlobalStopDrag();
  }

  // Função para editar uma rota específica
  function editSingleRoute(routeIndex) {
    console.log(`🔧 editSingleRoute chamada com routeIndex: ${routeIndex}`);
    console.log(`📊 routes.length: ${routes.length}, routeData.length: ${routeData.length}`);
    
    // Validar se o routeIndex é válido
    if (routeIndex === null || routeIndex === undefined || routeIndex < 0 || routeIndex >= routes.length) {
      console.error(`❌ routeIndex inválido: ${routeIndex}`);
      return;
    }
    
    // Se já estiver editando outra rota, finalizar primeiro
    if (editingRouteIndex !== null && editingRouteIndex !== routeIndex) {
      finishEditingRoute(editingRouteIndex);
    }
    
    editingRouteIndex = routeIndex;
    const route = routes[routeIndex];
    
    if (!route) {
      console.error(`❌ Rota não encontrada no índice ${routeIndex}`);
      return;
    }
    
    // Encontrar routeInfo correspondente
    const routeInfo = routeData.find(rd => rd.polyline === route);
    
    if (!routeInfo) {
      console.error(`❌ RouteInfo não encontrada para rota ${routeIndex}`);
      console.log(`🔍 routeData:`, routeData.map(rd => ({ ctoIndex: rd.ctoIndex, ctoNome: rd.cto?.nome })));
      return;
    }
    
    const ctoIndex = routeInfo.ctoIndex;
    console.log(`✅ RouteInfo encontrada: CTO ${ctoIndex} (${routeInfo.cto?.nome})`);
    
    if (route && route.setEditable) {
      route.setEditable(true);
      console.log(`✏️ Rota ${routeIndex} (CTO ${ctoIndex}) agora está editável`);
      
      // Salvar path inicial para comparação
      try {
        const initialPath = route.getPath();
        if (!initialPath) {
          console.warn(`⚠️ getPath() retornou null/undefined para CTO ${ctoIndex}`);
          return;
        }
        
        if (initialPath.getLength && initialPath.getLength() === 0) {
          console.warn(`⚠️ Path inicial vazio para CTO ${ctoIndex}`);
          return;
        }
        
        // Converter path para array
        let initialPathArray = [];
        if (initialPath.forEach) {
          initialPath.forEach((p) => {
            initialPathArray.push(p);
          });
        } else if (Array.isArray(initialPath)) {
          initialPathArray = initialPath;
        } else {
          try {
            initialPathArray = Array.from(initialPath);
          } catch (e) {
            console.warn(`⚠️ Erro ao converter path inicial para array para CTO ${ctoIndex}:`, e);
            return;
          }
        }
        
        // Filtrar pontos válidos
        const validInitialPoints = initialPathArray.filter(p => {
          if (!p) return false;
          if (typeof p.lat === 'function' && typeof p.lng === 'function') return true;
          if (typeof p.lat === 'number' && typeof p.lng === 'number') return true;
          return false;
        });
        
        if (validInitialPoints.length === 0) {
          console.warn(`⚠️ Nenhum ponto válido no path inicial para CTO ${ctoIndex}`);
          return;
        }
        
        const initialPathString = validInitialPoints.map(p => {
          const lat = typeof p.lat === 'function' ? p.lat() : p.lat;
          const lng = typeof p.lng === 'function' ? p.lng() : p.lng;
          return `${lat.toFixed(6)},${lng.toFixed(6)}`;
        }).join('|');
        lastRoutePaths.set(ctoIndex, initialPathString);
        console.log(`💾 Path inicial salvo para CTO ${ctoIndex}`);
      } catch (err) {
        console.warn(`⚠️ Erro ao salvar path inicial para CTO ${ctoIndex}:`, err);
      }
      
      // Remover listeners antigos
      google.maps.event.clearListeners(route, 'set_at');
      google.maps.event.clearListeners(route, 'insert_at');
      google.maps.event.clearListeners(route, 'remove_at');
      
      // Adicionar listeners para salvar alterações
      route.addListener('set_at', () => {
        saveRouteEdit(ctoIndex);
      });
      route.addListener('insert_at', () => {
        saveRouteEdit(ctoIndex);
      });
      route.addListener('remove_at', () => {
        saveRouteEdit(ctoIndex);
      });
      
      // Iniciar intervalo de verificação para esta rota
      if (routeEditInterval) {
        clearInterval(routeEditInterval);
      }
      let checkCount = 0;
      routeEditInterval = setInterval(() => {
        if (editingRouteIndex !== routeIndex) {
          return;
        }
        checkCount++;
        checkRouteChanges();
      }, 500);
    }
    
    // NÃO fechar o popup - ele deve permanecer aberto durante a edição
  }

  // Função para finalizar edição de uma rota específica
  function finishEditingRoute(routeIndex) {
    if (editingRouteIndex !== routeIndex) {
      return;
    }
    
    const route = routes[routeIndex];
    if (route && route.setEditable) {
      route.setEditable(false);
      console.log(`✓ Edição da rota ${routeIndex} finalizada`);
      
      // Remover listeners
      google.maps.event.clearListeners(route, 'set_at');
      google.maps.event.clearListeners(route, 'insert_at');
      google.maps.event.clearListeners(route, 'remove_at');
    }
    
    editingRouteIndex = null;
    
    // Parar intervalo
    if (routeEditInterval) {
      clearInterval(routeEditInterval);
      routeEditInterval = null;
    }
  }

  // Função para calcular distância total de um path (array de pontos)
  function calculatePathDistance(path) {
    if (!path || path.length < 2) return 0;
    
    let totalDistance = 0;
    for (let i = 0; i < path.length - 1; i++) {
      const point1 = path[i];
      const point2 = path[i + 1];
      totalDistance += calculateGeodesicDistance(
        point1.lat,
        point1.lng,
        point2.lat,
        point2.lng
      );
    }
    return totalDistance;
  }

  // Função para salvar alterações quando uma rota for editada
  function saveRouteEdit(ctoIndex) {
    console.log(`🔵 saveRouteEdit chamada para CTO índice: ${ctoIndex}`);
    
    // Encontrar a rota correspondente a esta CTO
    const routeInfo = routeData.find(rd => rd.ctoIndex === ctoIndex);
    if (!routeInfo || !routeInfo.polyline) {
      console.warn(`❌ Rota não encontrada para CTO índice ${ctoIndex}. RouteData:`, routeData);
      return;
    }
    
    const route = routeInfo.polyline;
    
    // Obter o path atualizado da rota editada
    const path = route.getPath();
    const updatedPath = [];
    
    path.forEach(point => {
      updatedPath.push({ lat: point.lat(), lng: point.lng() });
    });
    
    console.log(`📏 Path atualizado tem ${updatedPath.length} pontos`);
    
    // Calcular nova distância total do path editado
    const newDistance = calculatePathDistance(updatedPath);
    console.log(`📐 Nova distância calculada: ${newDistance}m`);
    
    // Atualizar dados da rota
    routeInfo.editedPath = updatedPath;
    
    // Atualizar distância no objeto CTO correspondente
    if (ctos && ctos[ctoIndex]) {
      // Arredondar valores para manter consistência com o formato original
      // Formato: 129.15m (0.129km) - 2 casas decimais para metros, 3 para km
      const distanciaMetros = Math.round(newDistance * 100) / 100;
      const distanciaKm = Math.round((newDistance / 1000) * 1000) / 1000;
      
      console.log(`📊 Valores calculados: ${distanciaMetros}m (${distanciaKm}km)`);
      console.log(`📋 CTO antes da atualização:`, {
        nome: ctos[ctoIndex].nome,
        distancia_metros: ctos[ctoIndex].distancia_metros,
        distancia_km: ctos[ctoIndex].distancia_km
      });
      
      // Criar um novo objeto CTO com os valores atualizados para garantir reatividade
      const updatedCTO = {
        ...ctos[ctoIndex],
        distancia_metros: distanciaMetros,
        distancia_km: distanciaKm,
        distancia_real: newDistance
      };
      
      // Criar um novo array com o objeto atualizado para forçar reatividade do Svelte
      ctos = ctos.map((cto, idx) => idx === ctoIndex ? updatedCTO : cto);
      
      // Atualizar também o objeto CTO no routeData para que o popup reflita as mudanças
      if (routeInfo) {
        routeInfo.cto = updatedCTO;
        // Forçar reatividade do routeData também
        routeData = [...routeData];
      }
      
      console.log(`✅ Rota da CTO ${ctoIndex} (${updatedCTO.nome}) editada. Nova distância: ${distanciaMetros}m (${distanciaKm}km)`);
      console.log(`📋 CTO após atualização:`, {
        nome: ctos[ctoIndex].nome,
        distancia_metros: ctos[ctoIndex].distancia_metros,
        distancia_km: ctos[ctoIndex].distancia_km
      });
    } else {
      console.warn(`❌ CTO não encontrada no índice ${ctoIndex}. Array ctos:`, ctos);
    }
  }

  // Função para restaurar rota original (desfazer edições)
  function restoreRoute(routeIndex) {
    const route = routes[routeIndex];
    const routeInfo = routeData.find(rd => rd.polyline === route);
    
    if (route && routeInfo && routeInfo.originalPath) {
      route.setPath(routeInfo.originalPath.map(p => new google.maps.LatLng(p.lat, p.lng)));
      routeInfo.editedPath = null;
      console.log(`Rota ${routeIndex} restaurada para o path original`);
    }
  }

  // Função para calcular offset para CTOs com coordenadas duplicadas
  function calculateMarkerOffset(coordinateKey, indexInGroup, totalInGroup) {
    // Offset em graus (mínimo para deixar marcadores quase colados, mas ainda visíveis)
    // Usar um padrão sequencial lado a lado
    const baseOffset = 0.00002; // Aproximadamente 2-3 metros
    
    if (totalInGroup === 1) {
      return { latOffset: 0, lngOffset: 0 };
    }
    
    // Calcular posição sequencial: distribuir em linha horizontal
    // Centralizar o grupo (se houver número ímpar, o do meio fica no centro)
    const centerIndex = (totalInGroup - 1) / 2;
    const offsetFromCenter = indexInGroup - centerIndex;
    
    // Colocar lado a lado horizontalmente (apenas longitude muda)
    return {
      latOffset: 0,
      lngOffset: baseOffset * offsetFromCenter
    };
  }

  async function drawRoutesAndMarkers() {
    if (!map || !clientCoords || ctos.length === 0) return;

    const bounds = new google.maps.LatLngBounds();
    bounds.extend(clientCoords);

    // Desenhar rotas e marcadores para cada CTO

    // Agrupar CTOs por coordenadas para detectar duplicatas
    const coordinateGroups = {};
    for (let i = 0; i < ctos.length; i++) {
      const cto = ctos[i];
      if (isNaN(cto.latitude) || isNaN(cto.longitude) || 
          cto.latitude === null || cto.longitude === null ||
          cto.latitude === undefined || cto.longitude === undefined) {
        continue;
      }
      
      // Criar chave única para coordenadas (arredondar para evitar diferenças mínimas)
      const latRounded = Math.round(cto.latitude * 1000000) / 1000000;
      const lngRounded = Math.round(cto.longitude * 1000000) / 1000000;
      const coordKey = `${latRounded},${lngRounded}`;
      
      if (!coordinateGroups[coordKey]) {
        coordinateGroups[coordKey] = [];
      }
      coordinateGroups[coordKey].push({ index: i, cto });
    }

    // Contador para numeração sequencial (não baseado no índice do loop)
    let markerNumber = 1;

    // OTIMIZAÇÃO DE PERFORMANCE: Separar rotas de marcadores
    // 1. Primeiro: Criar todos os marcadores (rápido)
    // 2. Depois: Calcular todas as rotas em paralelo (Promise.all)
    
    // Preparar lista de CTOs que precisam de rotas
    const ctosParaRotas = [];
    const ctosParaMarcadores = [];

    for (let i = 0; i < ctos.length; i++) {
      const cto = ctos[i];

      // Validar coordenadas antes de processar
      if (isNaN(cto.latitude) || isNaN(cto.longitude) || 
          cto.latitude === null || cto.longitude === null ||
          cto.latitude === undefined || cto.longitude === undefined) {
        console.warn(`⚠️ CTO ${i + 1} (${cto.nome}) tem coordenadas inválidas (${cto.latitude}, ${cto.longitude}), pulando...`);
        continue;
      }

      // Validar se as coordenadas estão dentro de um range válido
      if (cto.latitude < -90 || cto.latitude > 90 || cto.longitude < -180 || cto.longitude > 180) {
        console.warn(`⚠️ CTO ${i + 1} (${cto.nome}) tem coordenadas fora do range válido (${cto.latitude}, ${cto.longitude}), pulando...`);
        continue;
      }

      // Parsear coordenadas com precisão (garantir que são números válidos)
      const ctoLat = parseFloat(cto.latitude);
      const ctoLng = parseFloat(cto.longitude);
      
      // Validar se as coordenadas são números válidos
      if (isNaN(ctoLat) || isNaN(ctoLng)) {
        console.warn(`⚠️ CTO ${i + 1} (${cto.nome}) tem coordenadas inválidas, pulando...`);
        continue;
      }
      
      // Posição original (SEMPRE usar esta para marcadores e rotas de CTOs de rua)
      const originalPosition = { lat: ctoLat, lng: ctoLng };
      
      // Verificar se é prédio
      const isPredio = cto.is_condominio === true;
      
      if (isPredio) {
        console.log(`🏢 Prédio detectado: ${cto.nome}, coordenadas: ${ctoLat}, ${ctoLng}`);
      }
      
      // Usar posição original para bounds
      bounds.extend(originalPosition);

      // Separar CTOs que precisam de rotas das que não precisam
      if (!cto.is_condominio && !isPredio && cto.distancia_metros && cto.distancia_metros > 0 && cto.distancia_real) {
        // CTOs normais que precisam de rotas
        ctosParaRotas.push({ cto, index: i, originalPosition, ctoLat, ctoLng, isPredio });
      }
      
      // Todas as CTOs precisam de marcadores
      ctosParaMarcadores.push({ cto, index: i, originalPosition, ctoLat, ctoLng, isPredio });
    }

    // ETAPA 1: Calcular TODAS as rotas em PARALELO (melhoria de performance crítica)
    console.log(`🚀 [Performance] Calculando ${ctosParaRotas.length} rotas em paralelo...`);
    const routePromises = ctosParaRotas.map(({ cto, index }) => 
      drawRealRoute(cto, index).catch(err => {
        console.warn(`⚠️ Erro ao desenhar rota para CTO ${index + 1} (${cto.nome}):`, err);
        return null; // Retornar null em caso de erro para não quebrar Promise.all
      })
    );
    
    // Aguardar todas as rotas em paralelo
    await Promise.all(routePromises);
    console.log(`✅ [Performance] Todas as rotas calculadas!`);

    // ETAPA 2: Criar todos os marcadores (já que rotas estão prontas)
    for (const { cto, index, originalPosition, ctoLat, ctoLng, isPredio } of ctosParaMarcadores) {

      // Adicionar marcador da CTO
      let ctoMarker = null;
      let markerCreated = false;
      
      // isPredio já foi definido acima (linha 2578)
      
      try {
        
        // Para prédios, usar verde baseado no STATUS_CTO
        // STATUS_CTO = "ATIVADO" → verde mais vivo (#28A745 ou similar)
        // STATUS_CTO ≠ "ATIVADO" → verde mais apagado (#6C757D ou #95A5A6)
        let ctoColor;
        if (isPredio) {
          const statusCto = cto.status_cto_condominio || cto.condominio_data?.status_cto || '';
          const isAtivado = statusCto && statusCto.toUpperCase().trim() === 'ATIVADO';
          // Verde mais vivo para ATIVADO, verde mais apagado para outros
          ctoColor = isAtivado ? '#28A745' : '#95A5A6'; // #28A745 = verde vivo, #95A5A6 = verde apagado/cinza
        } else {
          // Para CTOs normais, usar cor baseada na porcentagem de ocupação
          ctoColor = getCTOColor(cto.pct_ocup || 0);
        }

        // Usar markerNumber para numeração sequencial (1, 2, 3, 4, 5)
        // APENAS para CTOs normais (prédios não têm numeração)
        const currentMarkerNumber = isPredio ? null : markerNumber;

        // Visual diferente para prédios: usar ícone de prédio com múltiplos andares
        // Usar imagem SVG do prédio em vez de path customizado
        let iconConfig;
        
        if (isPredio) {
          // Determinar qual ícone usar baseado no status
          const statusCto = cto.status_cto_condominio || cto.condominio_data?.status_cto || '';
          const isAtivado = statusCto && statusCto.toUpperCase().trim() === 'ATIVADO';
          
          console.log(`🏢 Criando marcador de prédio: ${cto.nome}, status: ${statusCto}, ativado: ${isAtivado}`);
          
          // Criar SVG inline como data URI para garantir carregamento
          // Cores baseadas no status
          const windowColor = isAtivado ? '#28A745' : '#95A5A6';
          const strokeColor = isAtivado ? '#1E7E34' : '#7F8C8D';
          
          // SVG do prédio com janelas em grade 3x5
          const svgContent = `
            <svg width="24" height="32" viewBox="0 0 24 32" xmlns="http://www.w3.org/2000/svg">
              <!-- Corpo do prédio -->
              <rect x="2" y="4" width="20" height="26" fill="#F5F5F5" stroke="${strokeColor}" stroke-width="1.5"/>
              
              <!-- Janelas em grade 3x5 (15 janelas) -->
              <!-- Linha 1 -->
              <rect x="4" y="6" width="4" height="4" fill="${windowColor}"/>
              <rect x="10" y="6" width="4" height="4" fill="${windowColor}"/>
              <rect x="16" y="6" width="4" height="4" fill="${windowColor}"/>
              
              <!-- Linha 2 -->
              <rect x="4" y="11" width="4" height="4" fill="${windowColor}"/>
              <rect x="10" y="11" width="4" height="4" fill="${windowColor}"/>
              <rect x="16" y="11" width="4" height="4" fill="${windowColor}"/>
              
              <!-- Linha 3 -->
              <rect x="4" y="16" width="4" height="4" fill="${windowColor}"/>
              <rect x="10" y="16" width="4" height="4" fill="${windowColor}"/>
              <rect x="16" y="16" width="4" height="4" fill="${windowColor}"/>
              
              <!-- Linha 4 -->
              <rect x="4" y="21" width="4" height="4" fill="${windowColor}"/>
              <rect x="10" y="21" width="4" height="4" fill="${windowColor}"/>
              <rect x="16" y="21" width="4" height="4" fill="${windowColor}"/>
              
              <!-- Linha 5 -->
              <rect x="4" y="26" width="4" height="4" fill="${windowColor}"/>
              <rect x="10" y="26" width="4" height="4" fill="${windowColor}"/>
              <rect x="16" y="26" width="4" height="4" fill="${windowColor}"/>
              
              <!-- Entrada arqueada na base -->
              <path d="M 8 30 Q 12 26, 16 30" stroke="${strokeColor}" stroke-width="1.5" fill="none"/>
              <line x1="8" y1="30" x2="16" y2="30" stroke="${strokeColor}" stroke-width="1.5"/>
            </svg>
          `.trim();
          
          // Converter SVG para data URI
          const svgDataUri = 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svgContent);
          
          // Usar imagem SVG inline para prédios
          iconConfig = {
            url: svgDataUri,
            scaledSize: new google.maps.Size(24, 32), // Tamanho do ícone (24x32 pixels)
            anchor: new google.maps.Point(12, 32), // Anchor na base do prédio (centro horizontal, base vertical)
            origin: new google.maps.Point(0, 0) // Origem da imagem
          };
        } else {
          // Para CTOs de rua: usar círculo com anchor no centro (0,0)
          iconConfig = {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 18,
            fillColor: ctoColor,
            fillOpacity: 1,
            strokeColor: '#000000',
            strokeWeight: 3,
            anchor: new google.maps.Point(0, 0) // Centro do círculo - CRÍTICO para alinhamento correto
          };
        }

        // Para CTOs de rua, sempre usar originalPosition (já definido acima)
        // Isso garante alinhamento perfeito entre marcador e rota
        // IMPORTANTE: As coordenadas devem ser exatamente as mesmas usadas na rota
        ctoMarker = new google.maps.Marker({
          position: originalPosition,
          map: map,
          title: isPredio 
            ? `🏢 ${cto.nome} (PRÉDIO) - ${cto.distancia_metros}m - Não cria rota`
            : `${cto.nome} - ${cto.distancia_metros}m (${cto.vagas_total - cto.clientes_conectados} portas disponíveis)`,
          icon: iconConfig,
          label: isPredio ? undefined : (currentMarkerNumber ? { // Sem label para prédios, label numérico para CTOs normais
            text: `${currentMarkerNumber}`,
            color: '#FFFFFF',
            fontSize: '14px',
            fontWeight: 'bold'
          } : undefined),
          zIndex: 1000 + markerNumber,
          optimized: false // Garantir que todos os marcadores sejam renderizados
        });

        // Verificar se o marcador foi criado com sucesso
        if (ctoMarker && ctoMarker.getMap()) {
          markers.push(ctoMarker);
          markerCreated = true;

          // Incrementar o número do marcador APENAS para CTOs normais (não prédios)
          // Prédios não têm numeração, então não incrementam o contador
          if (!isPredio) {
            markerNumber++;
          }

          // InfoWindow para a CTO ou Prédio
          let infoWindowContent = '';
          
          if (isPredio) {
            // InfoWindow para PRÉDIO com CTOs internas
            const nomePredio = cto.nome || 'Prédio';
            const statusCto = cto.status_cto_condominio || 'N/A';
            const ctosInternas = cto.ctos_internas || [];
            
            let ctosListHTML = '';
            if (ctosInternas.length > 0) {
              ctosListHTML = '<div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid #ddd;">';
              ctosListHTML += `<strong style="color: #6C757D; font-size: 13px;">CTOs Internas (${ctosInternas.length}):</strong><br>`;
              
              ctosInternas.forEach((ctoInterna, idx) => {
                // Verificar se a CTO interna está ativa
                const statusCtoInterna = ctoInterna.status_cto || '';
                const isAtiva = statusCtoInterna && statusCtoInterna.toUpperCase().trim() === 'ATIVADO';
                const borderColor = isAtiva ? '#28A745' : '#DC3545';
                const bgColor = isAtiva ? '#f8f9fa' : '#fff5f5';
                
                ctosListHTML += `
                  <div style="margin-top: 8px; padding: 8px; background-color: ${bgColor}; border-left: 3px solid ${borderColor}; border-radius: 4px;">
                    <strong style="color: #333; font-size: 12px;">CTO ${idx + 1}:</strong><br>
                    <strong>Nome:</strong> ${String(ctoInterna.nome || 'N/A')}<br>
                    <strong>ID:</strong> ${String(ctoInterna.id || 'N/A')}<br>
                    <strong>Portas Disponíveis:</strong> ${Number(ctoInterna.portas_disponiveis || 0)}<br>
                    <strong>Portas Totais:</strong> ${Number(ctoInterna.vagas_total || 0)}<br>
                    <strong>Portas Conectadas:</strong> ${Number(ctoInterna.clientes_conectados || 0)}<br>
                    <strong>Status:</strong> <span style="color: ${isAtiva ? '#28A745' : '#DC3545'}; font-weight: bold;">${String(ctoInterna.status_cto || 'N/A')}</span><br>
                    ${!isAtiva ? '<div style="color: #DC3545; font-size: 11px; margin-top: 4px; font-weight: bold;">⚠️ CTO NÃO ATIVA</div>' : ''}
                  </div>
                `;
              });
              
              // Resumo total
              const totalPortasDisponiveis = ctosInternas.reduce((sum, c) => sum + (c.portas_disponiveis || 0), 0);
              const totalPortasTotais = ctosInternas.reduce((sum, c) => sum + (c.vagas_total || 0), 0);
              const totalPortasConectadas = ctosInternas.reduce((sum, c) => sum + (c.clientes_conectados || 0), 0);
              
              ctosListHTML += `
                <div style="margin-top: 8px; padding: 8px; background-color: #e8f5e9; border-left: 3px solid #28A745; border-radius: 4px;">
                  <strong style="color: #1B5E20;">Resumo Total:</strong><br>
                  <strong>Total de Portas Disponíveis:</strong> ${totalPortasDisponiveis}<br>
                  <strong>Total de Portas:</strong> ${totalPortasTotais}<br>
                  <strong>Total de Portas Conectadas:</strong> ${totalPortasConectadas}<br>
                </div>
              `;
              
              ctosListHTML += '</div>';
            } else {
              ctosListHTML = `
                <div style="margin-top: 12px; padding: 8px; background-color: #fff3cd; border-left: 3px solid #ffc107; border-radius: 4px;">
                  <strong style="color: #856404;">(Sem CTOs implantadas)</strong>
                </div>
              `;
            }
            
            // Conteúdo inicial do InfoWindow (será atualizado com endereço)
            infoWindowContent = `
              <div style="padding: 12px; font-family: 'Inter', sans-serif; line-height: 1.6; max-width: 350px;">
                <div style="background-color: #FFE5E5; padding: 8px; margin-bottom: 12px; border-left: 4px solid #DC3545; border-radius: 4px;">
                  <strong style="color: #DC3545; font-size: 14px;">🏢 PRÉDIO/CONDOMÍNIO</strong>
                </div>
                <strong>Nome:</strong> ${String(nomePredio)}<br>
                <strong>Status:</strong> ${String(statusCto)}<br>
                <strong>Distância:</strong> ${Number(cto.distancia_metros || 0)}m (${Number(cto.distancia_km || 0)}km)<br>
                <div id="predio-endereco-${index}" style="margin-top: 8px;">
                  <strong>Endereço:</strong> <span style="color: #6C757D;">Carregando...</span>
                </div>
                ${ctosListHTML}
              </div>
            `;
          } else {
            // InfoWindow para CTO NORMAL (rua)
            // Verificar se a CTO está ativa
            const statusCto = cto.status_cto || '';
            const isAtiva = statusCto && statusCto.toUpperCase().trim() === 'ATIVADO';
            
            // Adicionar alerta vermelho se não estiver ativa
            let alertaHTML = '';
            if (!isAtiva) {
              alertaHTML = `
                <div style="background-color: #DC3545; color: white; padding: 12px; margin-bottom: 12px; border-radius: 4px; font-weight: bold; text-align: center;">
                  ⚠️ CTO NÃO ATIVA
                </div>
              `;
            }
            
            infoWindowContent = `
              <div style="padding: 8px; font-family: 'Inter', sans-serif; line-height: 1.6;">
                ${alertaHTML}
                <strong>Cidade:</strong> ${String(cto.cidade || 'N/A')}<br>
                <strong>POP:</strong> ${String(cto.pop || 'N/A')}<br>
                <strong>Nome:</strong> ${String(cto.nome || 'N/A')}<br>
                <strong>ID:</strong> ${String(cto.id || 'N/A')}<br>
                <strong>Status:</strong> <span style="color: ${isAtiva ? '#28A745' : '#DC3545'}; font-weight: bold;">${String(statusCto || 'N/A')}</span><br>
                <strong>Total de Portas:</strong> ${Number(cto.vagas_total || 0)}<br>
                <strong>Portas Conectadas:</strong> ${Number(cto.clientes_conectados || 0)}<br>
                <strong>Portas Disponíveis:</strong> ${Number((cto.vagas_total || 0) - (cto.clientes_conectados || 0))}<br>
                <strong>Distância:</strong> ${Number(cto.distancia_metros || 0)}m (${Number(cto.distancia_km || 0)}km)
              </div>
            `;
          }
          
          const ctoInfoWindow = new google.maps.InfoWindow({
            content: infoWindowContent
          });

          // Adicionar listener de clique (async para buscar endereço do prédio)
          ctoMarker.addListener('click', async () => {
            ctoInfoWindow.open(map, ctoMarker);
            
            // Se for prédio, buscar endereço completo via reverse geocoding
            if (isPredio) {
              try {
                const predioLat = parseFloat(cto.latitude);
                const predioLng = parseFloat(cto.longitude);
                
                if (!isNaN(predioLat) && !isNaN(predioLng)) {
                  const result = await reverseGeocode(predioLat, predioLng);
                  
                  if (result.results && result.results.length > 0) {
                    // Priorizar resultado com mais informações (street_address ou premise)
                    // Se não encontrar, usar o primeiro resultado
                    let bestResult = result.results.find(r => {
                      const types = r.types || [];
                      return types.includes('street_address') || 
                             types.includes('premise') || 
                             types.includes('route');
                    }) || result.results[0];
                    const components = bestResult.address_components || [];
                    
                    // Extrair todos os componentes do endereço de forma mais completa
                    const streetComponent = components.find(c => 
                      c.types.includes('route')
                    );
                    const streetNumberComponent = components.find(c => 
                      c.types.includes('street_number')
                    );
                    const neighborhoodComponent = components.find(c => 
                      c.types.includes('sublocality') || 
                      c.types.includes('sublocality_level_1') ||
                      c.types.includes('neighborhood') ||
                      c.types.includes('sublocality_level_2')
                    );
                    const cityComponent = components.find(c => 
                      c.types.includes('locality') || 
                      c.types.includes('administrative_area_level_2')
                    );
                    const stateComponent = components.find(c => 
                      c.types.includes('administrative_area_level_1')
                    );
                    const postalCodeComponent = components.find(c => 
                      c.types.includes('postal_code')
                    );
                    
                    const rua = streetComponent?.long_name || streetComponent?.short_name || '';
                    const numero = streetNumberComponent?.long_name || '';
                    const bairro = neighborhoodComponent?.long_name || neighborhoodComponent?.short_name || '';
                    const cidade = cityComponent?.long_name || '';
                    const estado = stateComponent?.short_name || '';
                    const cep = postalCodeComponent?.long_name || '';
                    
                    // Formatar endereço completo de forma mais estruturada
                    let enderecoCompleto = '';
                    const partesEndereco = [];
                    
                    // Adicionar rua
                    if (rua) {
                      partesEndereco.push(rua);
                    }
                    
                    // Adicionar número
                    if (numero) {
                      partesEndereco.push(numero);
                    }
                    
                    // Se temos rua ou número, formatar como "Rua, Número"
                    if (partesEndereco.length > 0) {
                      enderecoCompleto = partesEndereco.join(', ');
                    }
                    
                    // Adicionar bairro
                    if (bairro) {
                      if (enderecoCompleto) {
                        enderecoCompleto += ` - ${bairro}`;
                      } else {
                        enderecoCompleto = bairro;
                      }
                    }
                    
                    // Adicionar cidade e estado
                    if (cidade) {
                      if (enderecoCompleto) {
                        enderecoCompleto += `, ${cidade}`;
                      } else {
                        enderecoCompleto = cidade;
                      }
                      
                      if (estado) {
                        enderecoCompleto += ` - ${estado}`;
                      }
                    }
                    
                    // Adicionar CEP
                    if (cep) {
                      if (enderecoCompleto) {
                        enderecoCompleto += `, ${cep}`;
                      } else {
                        enderecoCompleto = `CEP: ${cep}`;
                      }
                    }
                    
                    // Se não conseguiu montar endereço estruturado, usar o formatted_address do Google
                    if (!enderecoCompleto || (!rua && !numero && !bairro)) {
                      enderecoCompleto = bestResult.formatted_address || 'Endereço não disponível';
                    }
                    
                    // Atualizar conteúdo do InfoWindow com endereço
                    const enderecoElement = document.getElementById(`predio-endereco-${index}`);
                    if (enderecoElement) {
                      enderecoElement.innerHTML = `<strong>Endereço:</strong> ${enderecoCompleto}`;
                    } else {
                      // Se o elemento não foi encontrado, atualizar o conteúdo completo do InfoWindow
                      const nomePredio = cto.nome || 'Prédio';
                      const statusCto = cto.status_cto_condominio || 'N/A';
                      const ctosInternas = cto.ctos_internas || [];
                      
                      let ctosListHTML = '';
                      if (ctosInternas.length > 0) {
                        ctosListHTML = '<div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid #ddd;">';
                        ctosListHTML += `<strong style="color: #6C757D; font-size: 13px;">CTOs Internas (${ctosInternas.length}):</strong><br>`;
                        
                        ctosInternas.forEach((ctoInterna, idx) => {
                          const statusCtoInterna = ctoInterna.status_cto || '';
                          const isAtiva = statusCtoInterna && statusCtoInterna.toUpperCase().trim() === 'ATIVADO';
                          const borderColor = isAtiva ? '#28A745' : '#DC3545';
                          const bgColor = isAtiva ? '#f8f9fa' : '#fff5f5';
                          
                          ctosListHTML += `
                            <div style="margin-top: 8px; padding: 8px; background-color: ${bgColor}; border-left: 3px solid ${borderColor}; border-radius: 4px;">
                              <strong style="color: #333; font-size: 12px;">CTO ${idx + 1}:</strong><br>
                              <strong>Nome:</strong> ${String(ctoInterna.nome || 'N/A')}<br>
                              <strong>ID:</strong> ${String(ctoInterna.id || 'N/A')}<br>
                              <strong>Portas Disponíveis:</strong> ${Number(ctoInterna.portas_disponiveis || 0)}<br>
                              <strong>Portas Totais:</strong> ${Number(ctoInterna.vagas_total || 0)}<br>
                              <strong>Portas Conectadas:</strong> ${Number(ctoInterna.clientes_conectados || 0)}<br>
                              <strong>Status:</strong> <span style="color: ${isAtiva ? '#28A745' : '#DC3545'}; font-weight: bold;">${String(ctoInterna.status_cto || 'N/A')}</span><br>
                              ${!isAtiva ? '<div style="color: #DC3545; font-size: 11px; margin-top: 4px; font-weight: bold;">⚠️ CTO NÃO ATIVA</div>' : ''}
                            </div>
                          `;
                        });
                        
                        const totalPortasDisponiveis = ctosInternas.reduce((sum, c) => sum + (c.portas_disponiveis || 0), 0);
                        const totalPortasTotais = ctosInternas.reduce((sum, c) => sum + (c.vagas_total || 0), 0);
                        const totalPortasConectadas = ctosInternas.reduce((sum, c) => sum + (c.clientes_conectados || 0), 0);
                        
                        ctosListHTML += `
                          <div style="margin-top: 8px; padding: 8px; background-color: #e8f5e9; border-left: 3px solid #28A745; border-radius: 4px;">
                            <strong style="color: #1B5E20;">Resumo Total:</strong><br>
                            <strong>Total de Portas Disponíveis:</strong> ${totalPortasDisponiveis}<br>
                            <strong>Total de Portas:</strong> ${totalPortasTotais}<br>
                            <strong>Total de Portas Conectadas:</strong> ${totalPortasConectadas}<br>
                          </div>
                        `;
                        
                        ctosListHTML += '</div>';
                      } else {
                        ctosListHTML = `
                          <div style="margin-top: 12px; padding: 8px; background-color: #fff3cd; border-left: 3px solid #ffc107; border-radius: 4px;">
                            <strong style="color: #856404;">(Sem CTOs implantadas)</strong>
                          </div>
                        `;
                      }
                      
                      const updatedContent = `
                        <div style="padding: 12px; font-family: 'Inter', sans-serif; line-height: 1.6; max-width: 350px;">
                          <div style="background-color: #FFE5E5; padding: 8px; margin-bottom: 12px; border-left: 4px solid #DC3545; border-radius: 4px;">
                            <strong style="color: #DC3545; font-size: 14px;">🏢 PRÉDIO/CONDOMÍNIO</strong>
                          </div>
                          <strong>Nome:</strong> ${String(nomePredio)}<br>
                          <strong>Status:</strong> ${String(statusCto)}<br>
                          <strong>Distância:</strong> ${Number(cto.distancia_metros || 0)}m (${Number(cto.distancia_km || 0)}km)<br>
                          <div style="margin-top: 8px;">
                            <strong>Endereço:</strong> ${enderecoCompleto}
                          </div>
                          ${ctosListHTML}
                        </div>
                      `;
                      ctoInfoWindow.setContent(updatedContent);
                    }
                  }
                }
              } catch (err) {
                console.error('Erro ao buscar endereço do prédio:', err);
                const enderecoElement = document.getElementById(`predio-endereco-${index}`);
                if (enderecoElement) {
                  enderecoElement.innerHTML = '<strong>Endereço:</strong> <span style="color: #DC3545;">Não foi possível obter o endereço</span>';
                }
              }
            }
            
            // Mostrar popup vermelho de alerta se CTO não estiver ativa (apenas para CTOs de rua)
            if (!isPredio) {
              const statusCto = cto.status_cto || '';
              const isAtiva = statusCto && statusCto.toUpperCase().trim() === 'ATIVADO';
              
              if (!isAtiva) {
                // Criar e mostrar popup vermelho de alerta
                const alertPopup = document.createElement('div');
                alertPopup.style.cssText = `
                  position: fixed;
                  top: 50%;
                  left: 50%;
                  transform: translate(-50%, -50%);
                  background-color: #DC3545;
                  color: white;
                  padding: 24px 32px;
                  border-radius: 8px;
                  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
                  z-index: 10000;
                  font-family: 'Inter', sans-serif;
                  font-size: 18px;
                  font-weight: bold;
                  text-align: center;
                  max-width: 400px;
                  animation: fadeIn 0.3s ease-in;
                `;
                alertPopup.innerHTML = `
                  <div style="font-size: 32px; margin-bottom: 12px;">⚠️</div>
                  <div>CTO NÃO ATIVA</div>
                  <div style="font-size: 14px; font-weight: normal; margin-top: 8px; opacity: 0.9;">
                    Esta CTO não está ativa no sistema
                  </div>
                  <button onclick="this.parentElement.remove()" style="
                    margin-top: 16px;
                    padding: 8px 24px;
                    background-color: white;
                    color: #DC3545;
                    border: none;
                    border-radius: 4px;
                    cursor: pointer;
                    font-weight: bold;
                    font-size: 14px;
                  ">Fechar</button>
                `;
                
                // Adicionar animação CSS se não existir
                if (!document.getElementById('alert-popup-style')) {
                  const style = document.createElement('style');
                  style.id = 'alert-popup-style';
                  style.textContent = `
                    @keyframes fadeIn {
                      from { opacity: 0; transform: translate(-50%, -60%); }
                      to { opacity: 1; transform: translate(-50%, -50%); }
                    }
                  `;
                  document.head.appendChild(style);
                }
                
                document.body.appendChild(alertPopup);
                
                // Remover popup após 5 segundos ou ao clicar fora
                setTimeout(() => {
                  if (alertPopup.parentElement) {
                    alertPopup.remove();
                  }
                }, 5000);
                
                // Remover ao clicar fora
                const overlay = document.createElement('div');
                overlay.style.cssText = `
                  position: fixed;
                  top: 0;
                  left: 0;
                  width: 100%;
                  height: 100%;
                  background-color: rgba(0, 0, 0, 0.5);
                  z-index: 9999;
                `;
                overlay.addEventListener('click', () => {
                  alertPopup.remove();
                  overlay.remove();
                });
                document.body.insertBefore(overlay, alertPopup);
              }
            }
          });
        } else {
          console.error(`❌ Falha ao criar marcador ${isPredio ? 'de prédio' : currentMarkerNumber} para ${cto.nome}: marcador não foi adicionado ao mapa`);
        }

      } catch (markerErr) {
        console.error(`❌ Erro ao criar marcador para CTO ${index + 1} (${cto.nome}):`, markerErr);
        // Se o marcador foi parcialmente criado, tentar removê-lo
        if (ctoMarker && ctoMarker.setMap) {
          try {
            ctoMarker.setMap(null);
          } catch (e) {
            // Ignorar erro ao remover
          }
        }
      }
      
      // Se o marcador não foi criado, não incrementar o contador
      // Mas apenas avisar se não for prédio (prédios não têm numeração mesmo)
      if (!markerCreated && !isPredio) {
        console.warn(`⚠️ CTO ${index + 1} (${cto.nome}) não foi marcada no mapa. Numeração não incrementada.`);
      }
    }

    const ctoMarkersCount = markers.filter(m => m !== clientMarker).length;

    if (ctoMarkersCount !== ctos.length) {
      console.warn(`⚠️ ATENÇÃO: Esperado ${ctos.length} marcadores, mas apenas ${ctoMarkersCount} foram criados!`);
    }

    // Ajustar zoom para mostrar todos os pontos com padding mínimo para maximizar visibilidade
    if (bounds.getNorthEast() && bounds.getSouthWest()) {
      // Adicionar padding mínimo para garantir que todos os marcadores fiquem visíveis
      map.fitBounds(bounds, {
        top: 40,
        right: 40,
        bottom: 40,
        left: 40
      });
      
      // Aguardar ajuste do mapa
      await new Promise((resolve) => {
        const boundsListener = google.maps.event.addListener(map, 'bounds_changed', () => {
          google.maps.event.removeListener(boundsListener);
          resolve();
        });
        setTimeout(() => {
          google.maps.event.removeListener(boundsListener);
          resolve();
        }, 1000);
      });
      
      // Verificar se todos os marcadores estão visíveis
      const finalBounds = map.getBounds();
      if (finalBounds) {
        let allMarkersVisible = true;
        
        // Verificar cliente
        if (!finalBounds.contains(clientCoords)) {
          allMarkersVisible = false;
        }
        
        // Verificar todas as CTOs
        if (allMarkersVisible) {
          for (const cto of ctos) {
            if (!finalBounds.contains({ lat: cto.latitude, lng: cto.longitude })) {
              allMarkersVisible = false;
              console.warn(`⚠️ CTO ${cto.nome} não está visível nos bounds finais`);
              break;
            }
          }
        }
        
        // Se algum marcador não está visível, ajustar novamente com mais padding
        if (!allMarkersVisible) {
          map.fitBounds(bounds, {
            top: 60,
            right: 60,
            bottom: 60,
            left: 60
          });
          
          await new Promise((resolve) => {
            const boundsListener = google.maps.event.addListener(map, 'bounds_changed', () => {
              google.maps.event.removeListener(boundsListener);
              resolve();
            });
    setTimeout(() => {
              google.maps.event.removeListener(boundsListener);
              resolve();
            }, 1000);
          });
        }
      }
    }

    // Ajustar zoom máximo se necessário (permitir zoom até 19 para melhor visualização)
    const listener = google.maps.event.addListener(map, 'bounds_changed', () => {
      if (map.getZoom() > 19) {
        map.setZoom(19);
      }
      google.maps.event.removeListener(listener);
    });
  }

  // Função para abrir modal de relatório
  async function openReportModal() {
    // Limpar erros anteriores
    reportFormErrors = {};
    
    // Limpar número do ALA (será preenchido pelo usuário)
    reportForm.numeroALA = '';
    
    // Pré-preencher o projetista com o usuário logado
    reportForm.projetista = currentUser || '';

    // Fechar InfoWindow do cliente automaticamente
    if (clientInfoWindow) {
      clientInfoWindow.close();
    }

    // Pré-preencher formulário com dados do endereço
    reportForm.cidade = clientAddressData.cidade;
    reportForm.enderecoCompleto = clientAddressData.enderecoCompleto;
    reportForm.numeroEndereco = clientAddressData.numero;
    reportForm.cep = clientAddressData.cep;

    // Limpar erros anteriores
    reportFormErrors = {};
    mapPreviewImage = '';
    capturingMap = true;

    // Abrir modal primeiro
    showReportModal = true;

    // Capturar mapa automaticamente
    try {
      const capturedImage = await captureMapAutomatically();
      mapPreviewImage = capturedImage;
    } catch (captureError) {
      console.error('Erro ao capturar mapa:', captureError);
      error = 'Erro ao capturar mapa automaticamente: ' + captureError.message;
    } finally {
      capturingMap = false;
    }
  }

  // Função para capturar automaticamente o mapa
  async function captureMapAutomatically() {
    if (!map || !clientCoords) {
      throw new Error('Mapa não está pronto para captura');
    }

    try {
      // Salvar estado atual do mapa
      const currentCenter = map.getCenter();
      const currentZoom = map.getZoom();

      // Criar bounds incluindo cliente
      const bounds = new google.maps.LatLngBounds();
      bounds.extend(clientCoords);

      // Adicionar todas as CTOs aos bounds (se houver)
      if (ctos.length > 0) {
        ctos.forEach(cto => {
          bounds.extend({ lat: cto.latitude, lng: cto.longitude });
        });
      }

      // Usar fitBounds com padding mínimo para maximizar o zoom
      map.fitBounds(bounds, {
        top: 15,
        right: 15,
        bottom: 15,
        left: 15
      });

      // Aguardar o mapa ajustar completamente usando evento idle
      await new Promise((resolve) => {
        const idleListener = google.maps.event.addListener(map, 'idle', () => {
          google.maps.event.removeListener(idleListener);
          resolve();
        });
        setTimeout(() => {
          google.maps.event.removeListener(idleListener);
          resolve();
        }, 2000);
      });

      // Aguardar um pouco mais para garantir estabilidade
      await new Promise(resolve => setTimeout(resolve, 500));

      // Agora aumentar o zoom gradualmente até encontrar o máximo que ainda mostra tudo
      let currentZoomLevel = map.getZoom();
      let bestZoom = currentZoomLevel;

      // Tentar aumentar o zoom gradualmente (máximo até zoom 20 para mais detalhes)
      for (let testZoom = currentZoomLevel + 1; testZoom <= 20; testZoom++) {
        map.setZoom(testZoom);
        
        // Aguardar evento idle após cada mudança de zoom
        await new Promise((resolve) => {
          const idleListener = google.maps.event.addListener(map, 'idle', () => {
            google.maps.event.removeListener(idleListener);
            resolve();
          });
          setTimeout(() => {
            google.maps.event.removeListener(idleListener);
            resolve();
          }, 800);
        });

        // Verificar se todas as CTOs e o cliente ainda estão visíveis
        const testBounds = map.getBounds();
        if (!testBounds) {
          break;
        }

        let allVisible = testBounds.contains(clientCoords);
        
        // Verificar todas as CTOs (se houver)
        if (allVisible && ctos.length > 0) {
          for (const cto of ctos) {
            if (!testBounds.contains({ lat: cto.latitude, lng: cto.longitude })) {
              allVisible = false;
              break;
            }
          }
        }

        if (allVisible) {
          bestZoom = testZoom;
        } else {
          // Se não está mais visível, usar o último zoom válido
          break;
        }
      }

      // Aplicar o melhor zoom encontrado
      map.setZoom(bestZoom);
      
      // Aguardar estabilização final
      await new Promise((resolve) => {
        const idleListener = google.maps.event.addListener(map, 'idle', () => {
          google.maps.event.removeListener(idleListener);
          resolve();
        });
        setTimeout(() => {
          google.maps.event.removeListener(idleListener);
          resolve();
        }, 1500);
      });

      // Verificação final: garantir que tudo está visível
      const finalBounds = map.getBounds();
      if (finalBounds) {
        let finalAllVisible = finalBounds.contains(clientCoords);
        if (finalAllVisible) {
          for (const cto of ctos) {
            if (!finalBounds.contains({ lat: cto.latitude, lng: cto.longitude })) {
              finalAllVisible = false;
        break;
      }
    }
  }

        // Se algo não está visível, reduzir zoom um nível (mas manter zoom alto se possível)
        if (!finalAllVisible && bestZoom > 16) {
          map.setZoom(bestZoom - 1);
          await new Promise((resolve) => {
            const idleListener = google.maps.event.addListener(map, 'idle', () => {
              google.maps.event.removeListener(idleListener);
              resolve();
            });
            setTimeout(() => {
              google.maps.event.removeListener(idleListener);
              resolve();
            }, 1000);
          });
        }
      }

      // Aguardar estabilidade final antes de capturar (reduzido)
      await new Promise(resolve => setTimeout(resolve, 500));

      // Aguardar evento idle do mapa para garantir renderização
      await new Promise((resolve) => {
        const idleListener = google.maps.event.addListener(map, 'idle', () => {
          google.maps.event.removeListener(idleListener);
          resolve();
        });
        setTimeout(() => {
          google.maps.event.removeListener(idleListener);
          resolve();
        }, 1000);
      });

      const mapElement = document.getElementById('map');
      if (!mapElement) {
        throw new Error('Elemento do mapa não encontrado');
      }
      
      // Garantir que o elemento está visível
      mapElement.style.visibility = 'visible';
      mapElement.style.opacity = '1';
      mapElement.style.display = 'block';
      
      // Aguardar alguns frames após ajustar estilos
      for (let i = 0; i < 3; i++) {
        await new Promise(resolve => requestAnimationFrame(resolve));
        void mapElement.offsetHeight;
      }
      
      // Capturar usando html2canvas com configurações otimizadas
      
      const canvas = await html2canvas(mapElement, {
        useCORS: true,
        allowTaint: false,
        backgroundColor: '#ffffff', // Branco para evitar fundo cinza
        scale: 2,
        logging: false,
        timeout: 20000,
        imageTimeout: 10000,
        removeContainer: true,
        foreignObjectRendering: false,
        onclone: (clonedDoc, clonedWindow) => {
          // Garantir que o body e html tenham fundo branco
          if (clonedDoc.body) {
            clonedDoc.body.style.background = '#ffffff';
            clonedDoc.body.style.backgroundColor = '#ffffff';
          }
          if (clonedDoc.documentElement) {
            clonedDoc.documentElement.style.background = '#ffffff';
            clonedDoc.documentElement.style.backgroundColor = '#ffffff';
          }
          
          const clonedMap = clonedDoc.getElementById('map');
          if (clonedMap) {
            clonedMap.style.visibility = 'visible';
            clonedMap.style.opacity = '1';
            clonedMap.style.display = 'block';
            clonedMap.style.transform = 'none';
            clonedMap.style.position = 'relative';
            clonedMap.style.overflow = 'visible';
            clonedMap.style.background = '#ffffff';
            clonedMap.style.backgroundColor = '#ffffff';
            
            // Remover qualquer overlay ou elemento que possa causar problemas
            const allElements = clonedMap.querySelectorAll('*');
            allElements.forEach((el) => {
              if (el.style) {
                // Remover backgrounds cinzas ou semi-transparentes
                const bg = el.style.background || el.style.backgroundColor;
                if (bg && (bg.includes('rgba') || bg.includes('rgb') || bg.includes('#f5f5f5') || bg.includes('#f0f0f0') || bg.includes('#e5e5e5'))) {
                  el.style.background = 'transparent';
                  el.style.backgroundColor = 'transparent';
                }
                // Garantir que elementos estão visíveis
                el.style.visibility = 'visible';
                el.style.opacity = '1';
              }
            });
          }
        }
      });

      // Converter para base64 com qualidade máxima
      const imageData = canvas.toDataURL('image/png', 1.0);
      return imageData;
    } catch (err) {
      console.error('Erro ao capturar mapa:', err);
      throw err;
    }
  }


  // Função para lidar com entrada do número do ALA (apenas números)
  function handleNumeroALAInput(event) {
    const input = event.target.value;
    // Remover "ALA-" se o usuário digitou e qualquer caractere que não seja número
    let numbersOnly = input.replace(/^ALA-/i, '').replace(/[^0-9]/g, '');
    
    // Verificar se havia caracteres não numéricos (além do prefixo ALA-)
    const inputWithoutPrefix = input.replace(/^ALA-/i, '');
    const hadNonNumeric = inputWithoutPrefix.length > numbersOnly.length;
    
    if (hadNonNumeric) {
      // Se tentou digitar letras ou caracteres especiais, mostrar erro
      reportFormErrors.numeroALA = 'Digite apenas números';
    } else {
      // Limpar erro se estiver correto
      if (reportFormErrors.numeroALA === 'Digite apenas números') {
        reportFormErrors.numeroALA = '';
      }
    }
    
    // Atualizar valor com prefixo ALA- (sempre com prefixo quando houver números)
    reportForm.numeroALA = numbersOnly ? `ALA-${numbersOnly}` : '';
    
    // Atualizar o valor do input para mostrar "ALA-" + números
    event.target.value = numbersOnly ? `ALA-${numbersOnly}` : '';
    
    // Validar campo após atualizar valor
    validateField('numeroALA');
  }

  // Função para validar um campo individual e limpar erro se válido
  function validateField(fieldName) {
    if (!reportFormErrors[fieldName]) {
      return; // Se não há erro, não precisa validar
    }

    let isValid = false;

    switch (fieldName) {
      case 'numeroALA':
        if (reportForm.numeroALA.trim()) {
          const numeroSemPrefixo = reportForm.numeroALA.replace(/^ALA-/i, '');
          if (numeroSemPrefixo && /^\d+$/.test(numeroSemPrefixo)) {
            isValid = true;
          }
        }
        break;
      case 'cidade':
        isValid = reportForm.cidade.trim().length > 0;
        break;
      case 'enderecoCompleto':
        isValid = reportForm.enderecoCompleto.trim().length > 0;
        break;
      case 'numeroEndereco':
        isValid = reportForm.numeroEndereco.trim().length > 0;
        break;
      case 'cep':
        isValid = reportForm.cep.trim().length > 0;
        break;
      case 'tabulacaoFinal':
        isValid = !!reportForm.tabulacaoFinal;
        break;
      case 'projetista':
        isValid = reportForm.projetista && reportForm.projetista.trim().length > 0;
        break;
    }

    if (isValid) {
      // Limpar erro se o campo estiver válido
      delete reportFormErrors[fieldName];
      reportFormErrors = reportFormErrors; // Trigger reactivity
    }
  }

  // Função para validar formulário
  function validateReportForm() {
    reportFormErrors = {};
    let isValid = true;

    // Validar número do ALA
    if (!reportForm.numeroALA.trim()) {
      reportFormErrors.numeroALA = 'Campo obrigatório';
      isValid = false;
    } else {
      // Verificar se contém apenas números após "ALA-"
      const numeroSemPrefixo = reportForm.numeroALA.replace(/^ALA-/i, '');
      if (!numeroSemPrefixo || !/^\d+$/.test(numeroSemPrefixo)) {
        reportFormErrors.numeroALA = 'Digite apenas números';
        isValid = false;
      }
    }
    if (!reportForm.cidade.trim()) {
      reportFormErrors.cidade = 'Campo obrigatório';
      isValid = false;
    }
    if (!reportForm.enderecoCompleto.trim()) {
      reportFormErrors.enderecoCompleto = 'Campo obrigatório';
      isValid = false;
    }
    if (!reportForm.numeroEndereco.trim()) {
      reportFormErrors.numeroEndereco = 'Campo obrigatório';
      isValid = false;
    }
    if (!reportForm.cep.trim()) {
      reportFormErrors.cep = 'Campo obrigatório';
      isValid = false;
    }
    if (!reportForm.tabulacaoFinal) {
      reportFormErrors.tabulacaoFinal = 'Campo obrigatório';
      isValid = false;
    }
    if (!reportForm.projetista || !reportForm.projetista.trim()) {
      reportFormErrors.projetista = 'Campo obrigatório';
      isValid = false;
    }

    return isValid;
  }

  // Função para obter lista de campos obrigatórios não preenchidos
  function getMissingRequiredFields() {
    const missingFields = [];
    const fieldLabels = {
      numeroALA: 'Número ALA',
      cidade: 'Cidade',
      enderecoCompleto: 'Endereço Completo',
      numeroEndereco: 'Número do Endereço',
      cep: 'CEP',
      tabulacaoFinal: 'Tabulação Final',
      projetista: 'Projetista'
    };

    for (const [field, label] of Object.entries(fieldLabels)) {
      if (reportFormErrors[field]) {
        missingFields.push(label);
      }
    }

    return missingFields;
  }

  // Função para fechar modal
  function closeReportModal() {
    showReportModal = false;
    reportFormErrors = {};
    mapPreviewImage = '';
    capturingMap = false;
    showPopupInstructions = false; // Limpar instruções ao fechar modal
  }

  async function exportToPDF() {
    if (!validateReportForm()) {
        return;
      }

    generatingPDF = true;
    error = null;

    try {
      // Obter próximo VI ALA (não bloqueia geração do PDF se falhar)
      console.log('Obtendo próximo VI ALA...');
      currentVIALA = ''; // Resetar antes de tentar obter
      
      // Usar Promise.race para adicionar timeout de 10 segundos (aumentado)
      try {
        const apiUrl = getApiUrl('/api/vi-ala/next');
        console.log('🔗 [VI ALA] URL da requisição:', apiUrl);
        console.log('⏱️ [VI ALA] Iniciando requisição...');
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 segundos
        
        const fetchPromise = fetch(apiUrl, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json'
          },
          signal: controller.signal
        });
        
        const viAlaResponse = await fetchPromise;
        clearTimeout(timeoutId);
        
        console.log('📡 [VI ALA] Resposta recebida, status:', viAlaResponse.status);
        
        if (viAlaResponse.ok) {
          const viAlaData = await viAlaResponse.json();
          console.log('📦 [VI ALA] Dados recebidos:', viAlaData);
          
          if (viAlaData.success && viAlaData.viAla) {
            currentVIALA = viAlaData.viAla;
            console.log('✅ [VI ALA] Obtido com sucesso:', currentVIALA);
          } else {
            console.warn('⚠️ [VI ALA] Resposta não contém VI ALA válido. Dados:', viAlaData);
          }
        } else {
          const errorText = await viAlaResponse.text();
          console.error('❌ [VI ALA] Erro HTTP. Status:', viAlaResponse.status);
          console.error('❌ [VI ALA] Resposta:', errorText);
          console.warn('⚠️ [VI ALA] Continuando sem VI ALA...');
        }
      } catch (viAlaErr) {
        if (viAlaErr.name === 'AbortError') {
          console.error('❌ [VI ALA] Timeout na requisição (10s)');
        } else {
          console.error('❌ [VI ALA] Erro:', viAlaErr);
          console.error('❌ [VI ALA] Tipo:', viAlaErr.name);
          console.error('❌ [VI ALA] Mensagem:', viAlaErr.message);
        }
        console.warn('⚠️ [VI ALA] Continuando sem VI ALA (não bloqueia geração do PDF)');
        // Não bloquear geração do PDF se houver erro ao obter VI ALA
      }
      
      // Se não conseguiu obter VI ALA, usar um valor padrão temporário para não quebrar o HTML
      if (!currentVIALA) {
        console.warn('⚠️ VI ALA não foi obtido, continuando sem ele no título do PDF');
      }

      // Usar a imagem já capturada (deve estar disponível)
      const mapImageData = mapPreviewImage;
      
      console.log('Iniciando geração de PDF...', { 
        temImagem: !!mapImageData, 
        tamanhoImagem: mapImageData ? mapImageData.length : 0,
        viAla: currentVIALA
      });
      
      if (!mapImageData) {
        error = 'Erro: Mapa não foi capturado. Por favor, feche e abra o modal novamente.';
        generatingPDF = false;
        return;
      }

      // Buscar data de atualização da base (opcional, não bloqueia)
      let baseLastModifiedText = '';
      try {
        const savedLastModified = localStorage.getItem('baseLastModified');
        if (savedLastModified) {
          const lastModified = new Date(savedLastModified);
          baseLastModifiedText = lastModified.toLocaleDateString('pt-BR', { 
            day: '2-digit', month: '2-digit', year: 'numeric'
          }) + ' - ' + lastModified.toLocaleTimeString('pt-BR', {
            hour: '2-digit', minute: '2-digit'
          });
        }
      } catch (err) {}
      
      // Buscar atualização em background (não bloqueia)
      fetch(getApiUrl('/api/base-last-modified'))
        .then(res => res.json())
        .then(data => {
          if (data.success && data.lastModified) {
            localStorage.setItem('baseLastModified', data.lastModified);
          }
        })
        .catch(() => {});
      
      console.log('Dados preparados, criando HTML do PDF...');

      // Obter data e hora atual
      const now = new Date();
      const dateStr = now.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
      const timeStr = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      // Salvar data e hora juntas no formato legível DD/MM/YYYY HH:MM
      const dataHoraLegivel = `${dateStr} ${timeStr}`;
      
      // Salvar registro na base_VI_ALA apenas se o VI ALA foi obtido com sucesso
      if (currentVIALA && currentVIALA.trim() !== '') {
        const viAlaRecord = {
          viAla: currentVIALA,
          ala: reportForm.numeroALA || '',
          data: dataHoraLegivel, // Salvar data e hora juntas no formato legível
          projetista: reportForm.projetista || '',
          cidade: reportForm.cidade || '',
          endereco: reportForm.enderecoCompleto || '',
          latitude: clientCoords ? clientCoords.lat.toFixed(6) : '',
          longitude: clientCoords ? clientCoords.lng.toFixed(6) : ''
        };
        
        console.log('💾 [Frontend] Salvando registro VI ALA na base...', viAlaRecord);
        
        // Salvar registro na base_VI_ALA (aguardar para garantir que seja salvo)
        try {
          const saveResponse = await fetch(getApiUrl('/api/vi-ala/save'), {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(viAlaRecord)
          });
          
          if (!saveResponse.ok) {
            const errorText = await saveResponse.text();
            throw new Error(`HTTP ${saveResponse.status}: ${errorText}`);
          }
          
          const saveData = await saveResponse.json();
          
          if (saveData.success) {
            console.log('✅ [Frontend] Registro VI ALA salvo com sucesso no Supabase');
          } else {
            console.warn('⚠️ [Frontend] Aviso: Não foi possível salvar registro VI ALA:', saveData.error);
          }
        } catch (saveErr) {
          console.error('❌ [Frontend] Erro ao salvar registro VI ALA:', saveErr);
          console.error('❌ [Frontend] Mensagem:', saveErr.message);
          console.error('❌ [Frontend] Stack:', saveErr.stack);
          // Não bloquear geração do PDF se o salvamento falhar, mas logar o erro
        }
      } else {
        console.warn('⚠️ [Frontend] VI ALA não foi obtido, não será salvo na base');
      }

      // Criar nome do arquivo PDF com VI ALA no formato: "VI ALA - XXXXXXX - ALA-15002 - Engenharia.pdf"
      let pdfFileName = '';
      if (currentVIALA && currentVIALA.trim() !== '') {
        // Converter formato "VI ALA-0000001" para "VI ALA - 0000001" se necessário
        const viAlaFormatted = currentVIALA.replace(/VI\s*ALA-/, 'VI ALA - ');
        pdfFileName = `${viAlaFormatted} - ${reportForm.numeroALA || 'ALA-00000'} - Engenharia.pdf`;
      } else {
        // Se não tiver VI ALA, usar formato antigo
        pdfFileName = `${reportForm.numeroALA || 'ALA-00000'} - Engenharia.pdf`;
      }

      // Criar conteúdo HTML para o PDF
      // Separar o style em uma variável para evitar conflito com o parser do Svelte
      const pdfStyles = `
              * { box-sizing: border-box; margin: 0; padding: 0; }
              body { 
                font-family: 'Inter', 'Segoe UI', Arial, sans-serif; 
                padding: 0 8px 0 8px; 
                background: white !important; 
                margin: 0;
                font-size: 13px;
                line-height: 1.4;
                color: #333;
                height: auto;
                min-height: auto;
                position: relative;
                z-index: 2;
              }
              .pdf-header {
                background: linear-gradient(135deg, #7B68EE 0%, #6495ED 100%);
                color: white;
                padding: 8px 12px;
                border-radius: 4px 4px 0 0;
                margin-top: 0;
                margin-bottom: 6px;
                display: flex;
                justify-content: space-between;
                align-items: center;
                box-shadow: 0 2px 6px rgba(123, 104, 238, 0.3);
                position: relative;
                z-index: 1;
              }
              .pdf-header h1 {
                font-size: 20px;
                font-weight: 700;
                margin: 0;
                color: white;
                letter-spacing: 0.2px;
                text-shadow: 0 1px 2px rgba(0,0,0,0.1);
                line-height: 1.4;
              }
              .pdf-header .date-info {
                font-size: 11px;
                opacity: 0.95;
                text-align: right;
                font-weight: 500;
                line-height: 1.4;
              }
              .report-container { 
                display: flex; 
                gap: 8px; 
                margin-bottom: 6px; 
                align-items: stretch; 
                height: auto;
              }
              .report-header { 
                background: linear-gradient(to bottom, #f8f9fa 0%, #ffffff 100%);
                padding: 8px;
                border-radius: 4px;
                border: 1px solid #e0e0e0;
                flex: 0 0 38%;
                box-shadow: 0 1px 3px rgba(0,0,0,0.08);
                display: flex;
                flex-direction: column;
              }
              .report-header h2 { 
                color: #7B68EE; 
                margin-top: 0; 
                margin-bottom: 5px; 
                font-size: 14px;
                font-weight: 700;
                padding-bottom: 3px;
                border-bottom: 2px solid #7B68EE;
                line-height: 1.3;
              }
              .report-info { 
                display: grid;
                grid-template-columns: 1fr;
                gap: 3px;
                margin-bottom: 5px;
                flex: 1;
              }
              .report-info-item { 
                display: flex;
                flex-direction: column;
                gap: 2px;
                padding: 3px 0;
                border-bottom: 1px solid #f0f0f0;
              }
              .report-info-item:last-child {
                border-bottom: none;
              }
              .report-info-label { 
                font-weight: 600; 
                color: #666; 
                font-size: 11px;
                text-transform: uppercase;
                letter-spacing: 0.2px;
                line-height: 1.3;
              }
              .report-info-value { 
                color: #333; 
                font-size: 12px;
                font-weight: 500;
                word-break: break-word;
                line-height: 1.4;
              }
              .summary-stats {
                margin-top: auto;
                padding-top: 5px;
                border-top: 2px solid #7B68EE;
                display: flex;
                flex-direction: column;
                gap: 2px;
              }
              .summary-stats p {
                margin: 0;
                font-size: 11px;
                color: #333;
                line-height: 1.3;
              }
              .summary-stats strong {
                color: #7B68EE;
                font-weight: 700;
              }
              .map-section { 
                flex: 1;
                display: flex; 
                flex-direction: column; 
                background: transparent !important;
                min-height: 0;
                align-items: center;
                position: relative;
                z-index: 1;
              }
              .map-section h2 { 
                color: #7B68EE; 
                margin-bottom: 5px; 
                font-size: 14px;
                font-weight: 700;
                margin-top: 0;
                text-align: center;
                padding-bottom: 3px;
                border-bottom: 2px solid #7B68EE;
                width: 100%;
                line-height: 1.3;
              }
              .map-wrapper {
                display: inline-flex;
                flex-direction: column;
                align-items: center;
                width: auto;
                max-width: 100%;
              }
              .map-image-container { 
                display: inline-block;
                width: auto;
                max-width: 100%;
                position: relative; 
                background: transparent !important; 
                border: 2px solid #7B68EE; 
                border-radius: 4px; 
                padding: 0; 
                overflow: hidden;
                box-shadow: 0 1px 4px rgba(123, 104, 238, 0.2);
                line-height: 0;
              }
              .map-image-container::before,
              .map-image-container::after { 
                display: none !important; 
              }
              .map-image { 
                display: block; 
                width: auto;
                height: auto;
                max-width: 100%;
                max-height: 320px;
                object-fit: contain;
                box-shadow: none; 
                background: transparent !important; 
                opacity: 1 !important; 
                filter: none !important;
                border-radius: 3px;
                margin: 0;
                padding: 0;
              }
              .map-image::before,
              .map-image::after { 
                display: none !important; 
              }
              .base-update-info {
                margin-top: 6px;
                font-size: 10px;
                color: #666;
                text-align: right;
                font-style: italic;
                padding-right: 0;
                width: 100%;
                align-self: flex-end;
                margin-left: 0;
                margin-right: 0;
              }
              @page {
                size: landscape;
                margin: 0.2cm 0.3cm 0.15cm 0.3cm;
                padding: 0;
              }
              @media print {
                * {
                  page-break-inside: avoid;
                  /* Forçar impressão de backgrounds independente da configuração do navegador */
                  print-color-adjust: exact !important;
                  -webkit-print-color-adjust: exact !important;
                  color-adjust: exact !important;
                }
                body { 
                  background: white !important;
                  padding: 0 4px 0 4px !important;
                  margin: 0 !important;
                  height: auto !important;
                  min-height: auto !important;
                  font-size: 13px !important;
                  line-height: 1.4 !important;
                  print-color-adjust: exact !important;
                  -webkit-print-color-adjust: exact !important;
                  color-adjust: exact !important;
                }
                .pdf-header {
                  page-break-after: avoid;
                  margin-top: 0 !important;
                  margin-bottom: 6px !important;
                  padding: 8px 12px !important;
                  print-color-adjust: exact !important;
                  -webkit-print-color-adjust: exact !important;
                  color-adjust: exact !important;
                }
                .pdf-header h1 {
                  font-size: 20px !important;
                  line-height: 1.3 !important;
                }
                .pdf-header .date-info {
                  font-size: 11px !important;
                  line-height: 1.3 !important;
                }
                .report-container {
                  page-break-inside: avoid;
                  height: auto;
                  gap: 8px !important;
                  margin-bottom: 6px !important;
                }
                .report-header {
                  padding: 8px !important;
                  print-color-adjust: exact !important;
                  -webkit-print-color-adjust: exact !important;
                  color-adjust: exact !important;
                }
                .report-header h2 {
                  margin-bottom: 5px !important;
                  padding-bottom: 3px !important;
                  font-size: 14px !important;
                  line-height: 1.3 !important;
                }
                .report-info {
                  gap: 3px !important;
                  margin-bottom: 5px !important;
                }
                .report-info-item {
                  padding: 3px 0 !important;
                  gap: 2px !important;
                }
                .report-info-label {
                  font-size: 11px !important;
                  line-height: 1.2 !important;
                }
                .report-info-value {
                  font-size: 12px !important;
                  line-height: 1.3 !important;
                }
                .summary-stats {
                  padding-top: 5px !important;
                  gap: 2px !important;
                }
                .summary-stats p {
                  font-size: 11px !important;
                  line-height: 1.3 !important;
                }
                .map-section h2 {
                  margin-bottom: 5px !important;
                  padding-bottom: 3px !important;
                  font-size: 14px !important;
                  line-height: 1.3 !important;
                }
                .table-container {
                  page-break-inside: avoid;
                  margin-top: 5px !important;
                  margin-bottom: 0 !important;
                  padding: 5px !important;
                  position: relative !important;
                  z-index: 1 !important;
                }
                .table-container h2 {
                  margin-bottom: 5px !important;
                  padding-bottom: 3px !important;
                  font-size: 14px !important;
                  line-height: 1.3 !important;
                }
                .map-image-container {
                  display: inline-block !important;
                  width: auto !important;
                  max-width: 100% !important;
                  height: auto !important;
                  background: transparent !important;
                  padding: 0 !important;
                  page-break-inside: avoid;
                }
                .map-image { 
                  display: block !important;
                  width: auto !important;
                  height: auto !important;
                  max-width: 100% !important;
                  max-height: 320px !important;
                  object-fit: contain !important;
                  margin: 0 !important;
                  padding: 0 !important;
                  page-break-inside: avoid; 
                  background: transparent !important; 
                  opacity: 1 !important; 
                  filter: none !important; 
                }
                .map-section { 
                  background: transparent !important;
                  page-break-inside: avoid;
                  height: auto;
                  position: relative !important;
                  z-index: 1 !important;
                }
                table {
                  page-break-inside: avoid;
                  font-size: 11px !important;
                  print-color-adjust: exact !important;
                  -webkit-print-color-adjust: exact !important;
                  color-adjust: exact !important;
                }
                thead {
                  print-color-adjust: exact !important;
                  -webkit-print-color-adjust: exact !important;
                  color-adjust: exact !important;
                }
                th {
                  padding: 5px 4px !important;
                  font-size: 11px !important;
                  line-height: 1.3 !important;
                  print-color-adjust: exact !important;
                  -webkit-print-color-adjust: exact !important;
                  color-adjust: exact !important;
                }
                tbody tr {
                  print-color-adjust: exact !important;
                  -webkit-print-color-adjust: exact !important;
                  color-adjust: exact !important;
                }
                }
                td {
                  padding: 4px 4px !important;
                  font-size: 11px !important;
                  line-height: 1.3 !important;
                  print-color-adjust: exact !important;
                  -webkit-print-color-adjust: exact !important;
                  color-adjust: exact !important;
                }
                thead {
                  display: table-header-group;
                  print-color-adjust: exact !important;
                  -webkit-print-color-adjust: exact !important;
                  color-adjust: exact !important;
                }
                tfoot {
                  display: table-footer-group;
                }
                .footer {
                  page-break-before: avoid;
                  margin-top: 3px !important;
                  margin-bottom: 0 !important;
                  padding-top: 3px !important;
                  padding-bottom: 0 !important;
                  font-size: 10px !important;
                  line-height: 1.3 !important;
                }
                .footer p {
                  margin: 0 !important;
                  padding: 0 !important;
                }
                .watermark {
                  position: fixed !important;
                  bottom: 10px !important;
                  left: 50% !important;
                  transform: translateX(-50%) !important;
                  font-size: 14px !important;
                  color: #333 !important;
                  opacity: 1 !important;
                  font-weight: 700 !important;
                  z-index: 1000 !important;
                  pointer-events: none !important;
                  white-space: nowrap !important;
                  text-align: center !important;
                }
              }
              .table-container {
                margin-top: 5px;
                overflow-x: auto;
                background: white;
                border-radius: 4px;
                padding: 5px;
                box-shadow: 0 1px 4px rgba(0,0,0,0.08);
                margin-bottom: 0;
                position: relative;
                z-index: 1;
              }
              .table-container h2 {
                color: #7B68EE;
                margin: 0 0 5px 0;
                font-size: 14px;
                font-weight: 700;
                padding-bottom: 3px;
                border-bottom: 2px solid #7B68EE;
                text-align: left;
                line-height: 1.3;
              }
              table { 
                width: 100%; 
                border-collapse: separate;
                border-spacing: 0;
                border: 2px solid #7B68EE;
                font-size: 11px;
                box-shadow: 0 1px 4px rgba(123, 104, 238, 0.15);
                border-radius: 4px;
                overflow: hidden;
              }
              thead {
                background: linear-gradient(135deg, #7B68EE 0%, #6495ED 100%);
              }
              th { 
                color: white; 
                padding: 5px 4px; 
                text-align: center; 
                font-weight: 700;
                border-right: 1px solid rgba(255,255,255,0.3);
                border-bottom: 2px solid rgba(255,255,255,0.4);
                font-size: 11px;
                text-transform: uppercase;
                letter-spacing: 0.2px;
                white-space: nowrap;
                line-height: 1.3;
              }
              th:last-child {
                border-right: none;
              }
              td { 
                padding: 4px 4px; 
                border-right: 1px solid #ddd;
                border-bottom: 1px solid #e0e0e0;
                text-align: center;
                font-size: 11px;
                color: #000000;
                font-weight: 500;
                vertical-align: middle;
                line-height: 1.3;
              }
              td:last-child {
                border-right: none;
              }
              tbody tr:nth-child(even) { 
                background-color: #f8f9fa; 
              }
              tbody tr:nth-child(odd) {
                background-color: #ffffff;
              }
              tbody tr:last-child td {
                border-bottom: none;
              }
              tbody tr:hover {
                background-color: #f0f4ff;
              }
              .footer {
                margin-top: 3px;
                padding-top: 3px;
                border-top: 1px solid #7B68EE;
                text-align: center;
                font-size: 10px;
                color: #666;
                margin-bottom: 0;
                padding-bottom: 0;
                line-height: 1.3;
              }
              .footer p {
                margin: 0;
                padding: 0;
              }
              .watermark {
                position: fixed;
                bottom: 10px;
                left: 50%;
                transform: translateX(-50%);
                font-size: 14px;
                color: #333;
                opacity: 1;
                font-weight: 700;
                z-index: 1000;
                pointer-events: none;
                white-space: nowrap;
                text-align: center;
                position: relative;
                z-index: 1;
              }
              @media print {
                .watermark {
                  position: fixed !important;
                  bottom: 10px !important;
                  left: 50% !important;
                  transform: translateX(-50%) !important;
                  font-size: 14px !important;
                  opacity: 1 !important;
                  font-weight: 700 !important;
                  color: #333 !important;
                  text-align: center !important;
                }
              }
      `;
      
      // Garantir que currentVIALA está definido e formatado corretamente
      const viAlaDisplay = currentVIALA ? ` - ${currentVIALA}` : '';
      const numeroALADisplay = reportForm.numeroALA || '';
      
      // Filtrar apenas CTOs de rua para o relatório (ANTES de usar no HTML)
      // IMPORTANTE: Calcular ANTES de usar na template string para evitar erro "Cannot access before initialization"
      const ctosRuaReport = ctos.filter(cto => !cto.is_condominio || cto.is_condominio === false);
      
      let htmlContent = `
        <html>
          <head>
            <meta charset="UTF-8">
            <title>${pdfFileName.replace('.pdf', '')}</title>
            <style>${pdfStyles}</style>
          </head>
          <body>
            <div class="pdf-header">
              <h1>Relatório de Análise de Viabilidade Técnica${viAlaDisplay}<br><span style="font-size: 15px; font-weight: 500; opacity: 0.95;">Alares Engenharia - ${numeroALADisplay}</span></h1>
              <div class="date-info">
                <div style="margin-bottom: 3px; line-height: 1.4;">Gerado em: ${dateStr} às ${timeStr}</div>
                <div style="font-size: 10px; opacity: 0.85; line-height: 1.3;">Sistema de Viabilidade Técnica</div>
              </div>
            </div>
            <div class="report-container">
              <div class="report-header">
                <h2>Informações do Relatório</h2>
                <div class="report-info">
                  <div class="report-info-item">
                    <span class="report-info-label">Número do ALA</span>
                    <span class="report-info-value">${reportForm.numeroALA}</span>
                  </div>
                  <div class="report-info-item">
                    <span class="report-info-label">Cidade</span>
                    <span class="report-info-value">${reportForm.cidade}</span>
                  </div>
                  <div class="report-info-item">
                    <span class="report-info-label">Endereço Completo</span>
                    <span class="report-info-value">${reportForm.enderecoCompleto}</span>
                  </div>
                  <div class="report-info-item">
                    <span class="report-info-label">Número do Endereço</span>
                    <span class="report-info-value">${reportForm.numeroEndereco}</span>
                  </div>
                  <div class="report-info-item">
                    <span class="report-info-label">CEP do Endereço</span>
                    <span class="report-info-value">${reportForm.cep}</span>
                  </div>
                  ${clientCoords ? `
                  <div class="report-info-item">
                    <span class="report-info-label">Latitude e Longitude</span>
                    <span class="report-info-value">${clientCoords.lat.toFixed(6)}, ${clientCoords.lng.toFixed(6)}</span>
                  </div>
                  ` : ''}
                  <div class="report-info-item">
                    <span class="report-info-label">Tabulação Final</span>
                    <span class="report-info-value">${reportForm.tabulacaoFinal}</span>
                  </div>
                  <div class="report-info-item">
                    <span class="report-info-label">Projetista</span>
                    <span class="report-info-value">${reportForm.projetista}</span>
                  </div>
                </div>
                <div class="summary-stats">
                  <p><strong>Total:</strong> <span style="font-weight: bold; color: #000000;">${ctosRuaReport.length}</span> <strong style="font-weight: bold; color: #000000;">${ctosRuaReport.length === 1 ? 'Equipamento encontrado' : 'Equipamentos encontrados'} dentro de 250m</strong></p>
                  <p><strong>Total de Portas Disponíveis:</strong> <span style="font-weight: bold; color: #000000;">${ctosRuaReport.reduce((sum, cto) => sum + (cto.vagas_total - cto.clientes_conectados), 0)}</span> <strong style="font-weight: bold; color: #000000;">portas</strong></p>
                </div>
              </div>
              ${mapImageData ? `
              <div class="map-section">
                <h2>Visualização do Mapa</h2>
                <div class="map-wrapper">
                  <div class="map-image-container">
                    <img src="${mapImageData}" alt="Mapa com CTOs e Cliente" class="map-image" />
                  </div>
                  ${baseLastModifiedText ? `<div class="base-update-info">*Última atualização da base em ${baseLastModifiedText}</div>` : ''}
                </div>
              </div>
              ` : ''}
            </div>
            <div class="table-container">
              <h2>Equipamentos CTO Encontrados</h2>
              <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Cidade</th>
                  <th>POP</th>
                  <th>Nome</th>
                  <th>ID</th>
                  <th>Total de Portas</th>
                  <th>Portas Conectadas</th>
                  <th>Portas Disponíveis</th>
                  <th>Distância</th>
                </tr>
              </thead>
              <tbody>
      `;

      // ctosRuaReport já foi definido acima (antes do htmlContent)
      ctosRuaReport.forEach((cto, index) => {
        const portasDisponiveis = cto.vagas_total - cto.clientes_conectados;
        const semPortas = portasDisponiveis === 0;
        const styleColor = semPortas ? ' style="color: #F44336;"' : '';
        htmlContent += `
          <tr${styleColor}>
            <td${styleColor}>${index + 1}</td>
            <td${styleColor}>${cto.cidade}</td>
            <td${styleColor}>${cto.pop}</td>
            <td${styleColor}>${cto.nome}</td>
            <td${styleColor}>${cto.id}</td>
            <td${styleColor}>${cto.vagas_total}</td>
            <td${styleColor}>${cto.clientes_conectados}</td>
            <td${styleColor}>${cto.vagas_total - cto.clientes_conectados}</td>
            <td${styleColor}>${cto.distancia_metros}m (${cto.distancia_km}km)</td>
          </tr>
        `;
      });

      htmlContent += `
              </tbody>
            </table>
            </div>
            <div class="watermark">Setor de Planejamento e Projetos - Engenharia Alares</div>
          </body>
        </html>
      `;

      console.log('HTML do PDF criado com sucesso, tamanho:', htmlContent.length, 'caracteres');

      // Criar nova janela para abrir PDF em nova aba
      console.log('Abrindo janela de impressão em nova aba...');
      const printWindow = window.open('', '_blank');
      
      // Verificar se a janela foi aberta (pode ser bloqueada por popup blocker)
      if (!printWindow || !printWindow.document) {
        console.error('Falha ao abrir janela de impressão - popup bloqueado?');
        generatingPDF = false;
        showPopupInstructions = true; // Mostrar instruções sobreposta ao modal
        error = null; // Limpar erro anterior para mostrar instruções
        return;
      }
      
      console.log('Janela de impressão aberta com sucesso');
      
      // Função auxiliar para finalizar a geração do PDF
      let pdfGenerationFinished = false;
      let printTimeoutId = null;
      let safetyTimeoutId = null;
      
      const finishPDFGeneration = () => {
        if (!pdfGenerationFinished) {
          pdfGenerationFinished = true;
          generatingPDF = false;
          if (printTimeoutId) clearTimeout(printTimeoutId);
          if (safetyTimeoutId) clearTimeout(safetyTimeoutId);
          
          // Limpar apenas os campos que devem ser preenchidos manualmente
          reportForm.numeroALA = '';
          reportForm.tabulacaoFinal = '';
          reportFormErrors = {};
          
          closeReportModal();
        }
      };

      // Função para tentar imprimir (só executa uma vez)
      const tryPrint = () => {
        if (pdfGenerationFinished) {
          console.log('PDF já foi finalizado, ignorando tentativa de impressão');
          return;
        }
        
        console.log('Tentando imprimir PDF...');
        
        if (printTimeoutId) {
          clearTimeout(printTimeoutId);
          printTimeoutId = null;
        }
        
        if (printWindow && !printWindow.closed) {
          try {
            printWindow.print();
            console.log('Comando de impressão executado com sucesso');
            finishPDFGeneration();
          } catch (printErr) {
            console.error('Erro ao imprimir:', printErr);
            error = 'Erro ao abrir diálogo de impressão: ' + printErr.message;
            finishPDFGeneration();
          }
        } else {
          console.warn('Janela de impressão foi fechada antes de imprimir');
          finishPDFGeneration();
        }
      };

      // Escrever o conteúdo HTML na nova janela
      console.log('Escrevendo conteúdo HTML na janela...');
      printWindow.document.open();
      printWindow.document.write(htmlContent);
      printWindow.document.close();
      
      // Definir título da janela
      printWindow.document.title = pdfFileName.replace('.pdf', '');
      console.log('Conteúdo HTML escrito, aguardando carregamento...');
      
      // Aguardar que o documento seja totalmente carregado
      const waitForDocument = () => {
        try {
          // Verificar se o documento está pronto
          if (printWindow && printWindow.document && printWindow.document.readyState === 'complete') {
            // Verificar se há imagens no documento
            const images = printWindow.document.querySelectorAll('img');
            const totalImages = images.length;
            
            console.log(`Documento carregado. Encontradas ${totalImages} imagens.`);
            
            if (totalImages === 0) {
              // Se não há imagens, imprimir após um pequeno delay
              printTimeoutId = setTimeout(tryPrint, 300);
              return;
            }
            
            // Para imagens base64 (data URLs), elas geralmente já estão "carregadas"
            let imagesReadyCount = 0;
            
            images.forEach((img) => {
              // Verificar se é uma imagem base64 (data URL)
              const isDataUrl = img.src && img.src.startsWith('data:');
              
              if (isDataUrl) {
                // Para data URLs, verificar se o src foi definido corretamente
                if (img.src && (img.complete || img.naturalWidth > 0)) {
                  imagesReadyCount++;
                } else {
                  // Forçar carregamento mesmo sendo data URL
                  const tempImg = new Image();
                  tempImg.onload = () => {
                    imagesReadyCount++;
                    if (imagesReadyCount === totalImages && !pdfGenerationFinished) {
                      printTimeoutId = setTimeout(tryPrint, 300);
                    }
                  };
                  tempImg.onerror = () => {
                    imagesReadyCount++;
                    if (imagesReadyCount === totalImages && !pdfGenerationFinished) {
                      printTimeoutId = setTimeout(tryPrint, 300);
                    }
                  };
                  tempImg.src = img.src;
                }
              } else {
                // Para imagens normais, verificar se estão carregadas
                if (img.complete && img.naturalWidth > 0) {
                  imagesReadyCount++;
                } else {
                  img.onload = () => {
                    imagesReadyCount++;
                    if (imagesReadyCount === totalImages && !pdfGenerationFinished) {
                      printTimeoutId = setTimeout(tryPrint, 300);
                    }
                  };
                  img.onerror = () => {
                    imagesReadyCount++;
                    if (imagesReadyCount === totalImages && !pdfGenerationFinished) {
                      printTimeoutId = setTimeout(tryPrint, 300);
                    }
                  };
                }
              }
            });
            
            // Se todas as imagens já estão prontas (especialmente para base64)
            if (imagesReadyCount === totalImages) {
              console.log('Todas as imagens estão prontas, agendando impressão...');
              printTimeoutId = setTimeout(tryPrint, 300);
              return;
            }
            
            console.log(`Aguardando imagens carregarem... (${imagesReadyCount}/${totalImages})`);
            
            // Timeout de segurança caso alguma imagem não carregue (2 segundos para base64)
            safetyTimeoutId = setTimeout(() => {
              if (!pdfGenerationFinished) {
                console.warn('Timeout ao aguardar imagens, imprimindo mesmo assim...');
                tryPrint();
              }
            }, 2000);
          } else {
            // Tentar novamente após um pequeno delay
            setTimeout(waitForDocument, 50);
          }
        } catch (err) {
          console.error('Erro ao aguardar documento:', err);
          // Tentar imprimir mesmo com erro após um delay
          setTimeout(() => {
            if (!pdfGenerationFinished) {
              tryPrint();
            }
          }, 500);
        }
      };
      
      // Aguardar um pouco antes de iniciar a verificação (dar tempo para o DOM renderizar)
      setTimeout(() => {
        waitForDocument();
      }, 100);
      
      // Timeout de segurança global: garantir que o estado seja resetado mesmo em caso de erro (8 segundos)
      setTimeout(() => {
        if (!pdfGenerationFinished) {
          console.warn('Timeout global na geração de PDF, resetando estado...');
          finishPDFGeneration();
        }
      }, 8000);

    } catch (err) {
      console.error('Erro na geração de PDF:', err);
      generatingPDF = false;
      error = 'Erro ao exportar PDF: ' + err.message;
    }
  }

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
      {#if currentTool === 'viabilidade-alares'}
        <!-- Ferramenta de Viabilidade (mantida no App.svelte por enquanto) -->
        <ToolWrapper
          toolTitle={tool.title}
          onBackToDashboard={handleBackToDashboard}
          onOpenSettings={() => {
            preloadSettingsData();
            openSettingsModal();
          }}
          showSettingsButton={true}
        >
          <div class="viabilidade-content">
            <div class="main-content">
    <aside class="sidebar">
      <!-- Box de aviso quando não há base de dados -->
      {#if !baseDataExists}
        <div class="base-data-warning">
          <div class="warning-icon">⚠️</div>
          <div class="warning-content">
            <h3>Atenção</h3>
            <p>Nenhuma base de dados foi carregada. Não é possível identificar as CTOs dentro da nossa estrutura de rede.</p>
          </div>
        </div>
      {/if}
      
      <div class="search-section">
        <h2>Localização do Cliente</h2>

        <div class="mode-selector">
          <button 
            class:active={searchMode === 'address'}
            on:click={() => searchMode = 'address'}
          >
            Endereço
          </button>
          <button 
            class:active={searchMode === 'coordinates'}
            on:click={() => searchMode = 'coordinates'}
          >
            Coordenadas
          </button>
        </div>

        {#if searchMode === 'address'}
          <div class="input-group">
            <label for="address">Endereço (Rua e Número)</label>
            <input 
              type="text" 
              id="address"
              bind:value={addressInput}
              placeholder="Ex: Rua Exemplo, 123, São Paulo"
              disabled={loading}
            />
          </div>
        {:else}
          <div class="input-group">
            <label for="coordinates">Coordenadas (Latitude, Longitude)</label>
            <input 
              type="text" 
              id="coordinates"
              bind:value={coordinatesInput}
              placeholder="Ex: -22.5728462249402, -47.40101216301998"
              disabled={loading}
            />
          </div>
        {/if}

        <button 
          class="search-button"
          on:click={searchClientLocation}
          disabled={loading || !googleMapsLoaded}
        >
          {loading ? 'Localizando...' : 'Localizar no Mapa'}
        </button>

        {#if clientCoords}
          <button 
            class="search-button"
            on:click={openReportModal}
          >
            Gerar Relatório
          </button>
        {/if}


        {#if error}
          <div class="error-message">
            {error}
          </div>
        {/if}

        {#if ctos.length > 0}
          <div class="results-info">
            <p>
              <strong>{ctosRua.length}</strong> 
              {ctosRua.length === 1 ? 'Equipamento encontrado' : 'Equipamentos encontrados'}
              <button 
                class="info-icon" 
                on:click={() => showInfoEquipamentos = !showInfoEquipamentos}
                title="Informação"
                aria-label="Informação sobre equipamentos"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <circle cx="12" cy="12" r="10" fill="#7B68EE" stroke="#7B68EE" stroke-width="1"/>
                  <path d="M12 16V12" stroke="white" stroke-width="2" stroke-linecap="round"/>
                  <circle cx="12" cy="8" r="1" fill="white"/>
                </svg>
              </button>
            </p>
            {#if showInfoEquipamentos}
              <div 
                class="info-modal-overlay" 
                on:click={() => showInfoEquipamentos = false}
                on:keydown={(e) => e.key === 'Escape' && (showInfoEquipamentos = false)}
                role="button"
                tabindex="-1"
                aria-label="Fechar modal de informação"
              >
                <div 
                  class="info-modal-box" 
                  on:click|stopPropagation
                  on:keydown={(e) => e.key === 'Enter' && e.stopPropagation()}
                  role="dialog"
                  tabindex="0"
                  aria-modal="true"
                >
                  <div class="info-modal-header">
                    <h3>Informação</h3>
                    <button class="info-modal-close" on:click={() => showInfoEquipamentos = false} aria-label="Fechar">×</button>
                  </div>
                  <div class="info-modal-body">
                    <p>Quantidade total de equipamentos CTO encontrados dentro de um raio de 250 metros do endereço pesquisado.</p>
                  </div>
                </div>
              </div>
            {/if}
          </div>

          {@const totalPortasDisponiveis = ctosRua.reduce((sum, cto) => sum + ((cto.vagas_total || 0) - (cto.clientes_conectados || 0)), 0)}
          <div class="results-info">
            <p>
              <strong>{totalPortasDisponiveis}</strong> 
              {totalPortasDisponiveis === 1 ? 'Porta disponível encontrada' : 'Portas disponíveis encontradas'}
              <button 
                class="info-icon" 
                on:click={() => showInfoPortas = !showInfoPortas}
                title="Informação"
                aria-label="Informação sobre portas disponíveis"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <circle cx="12" cy="12" r="10" fill="#7B68EE" stroke="#7B68EE" stroke-width="1"/>
                  <path d="M12 16V12" stroke="white" stroke-width="2" stroke-linecap="round"/>
                  <circle cx="12" cy="8" r="1" fill="white"/>
                </svg>
              </button>
            </p>
            {#if showInfoPortas}
              <div 
                class="info-modal-overlay" 
                on:click={() => showInfoPortas = false}
                on:keydown={(e) => e.key === 'Escape' && (showInfoPortas = false)}
                role="button"
                tabindex="-1"
                aria-label="Fechar modal de informação"
              >
                <div 
                  class="info-modal-box" 
                  on:click|stopPropagation
                  on:keydown={(e) => e.key === 'Enter' && e.stopPropagation()}
                  role="dialog"
                  tabindex="0"
                  aria-modal="true"
                >
                  <div class="info-modal-header">
                    <h3>Informação</h3>
                    <button class="info-modal-close" on:click={() => showInfoPortas = false} aria-label="Fechar">×</button>
                  </div>
                  <div class="info-modal-body">
                    <p>Soma total de portas disponíveis (não conectadas) de todos os equipamentos CTO encontrados dentro de um raio de 250 metros do endereço pesquisado.</p>
                  </div>
                </div>
              </div>
            {/if}
          </div>

          <div class="ctos-list-container">
            <div class="ctos-list">
              {#each ctosRua as cto, index}
                {@const ctoColor = getCTOColor(cto.pct_ocup || 0)}
                <div class="cto-item">
                  <div class="cto-header">
                    <span class="cto-number" style="background: {ctoColor};">{index + 1}</span>
                    <span class="cto-name">{cto.nome}</span>
                  </div>
                  <div class="cto-details">
                    <div class="cto-row">
                      <span class="cto-label">Cidade:</span>
                      <span class="cto-value">{cto.cidade}</span>
                    </div>
                    <div class="cto-row">
                      <span class="cto-label">POP:</span>
                      <span class="cto-value">{cto.pop}</span>
                    </div>
                    <div class="cto-row">
                      <span class="cto-label">ID:</span>
                      <span class="cto-value">{cto.id}</span>
                    </div>
                    <div class="cto-row">
                      <span class="cto-label">Total de Portas:</span>
                      <span class="cto-value">{cto.vagas_total}</span>
                    </div>
                    <div class="cto-row">
                      <span class="cto-label">Portas Conectadas:</span>
                      <span class="cto-value">{cto.clientes_conectados}</span>
                    </div>
                    <div class="cto-row">
                      <span class="cto-label">Portas Disponíveis:</span>
                      <span class="cto-value">{cto.vagas_total - cto.clientes_conectados}</span>
                    </div>
                    <div class="cto-row">
                      <span class="cto-label">Distância:</span>
                      <span class="cto-value">{cto.distancia_metros}m ({cto.distancia_km}km)</span>
                    </div>
                  </div>
                </div>
              {/each}
            </div>
          </div>
        {/if}
      </div>
      
      <!-- Área de usuário e logout - Fora do conteúdo scrollável -->
      <div class="user-section">
        <div class="user-info">
          <span class="user-icon">👤</span>
          <span 
            class="user-name clickable" 
            on:click={openChangePasswordModal}
            title="Clique para trocar a senha"
            role="button"
            tabindex="0"
            on:keydown={(e) => e.key === 'Enter' && openChangePasswordModal()}
          >
            {currentUser || 'Usuário'}
          </span>
        </div>
        <button class="logout-button" on:click={handleLogout} title="Sair">
          Sair
        </button>
      </div>
    </aside>

    <main class="map-container">
      <div id="map"></div>
      
      <!-- Popup de informações da rota -->
      {#if selectedRouteIndex !== null}
        {@const routeInfo = routeData.find(rd => {
          const route = routes[selectedRouteIndex];
          return rd.polyline === route;
        })}
        {@const cto = routeInfo ? routeInfo.cto : null}
        {@const ctoIndex = routeInfo ? routeInfo.ctoIndex : selectedRouteIndex}
        {@const distancia = cto ? `${cto.distancia_metros}m (${cto.distancia_km}km)` : 'N/A'}
        <div 
          class="route-popup"
          style="left: {routePopupPosition.x}px; top: {routePopupPosition.y}px;"
          on:mousemove={dragRoutePopup}
          on:mouseup={stopDraggingRoutePopup}
          on:mouseleave={stopDraggingRoutePopup}
        >
          <div class="route-popup-content">
            <div 
              class="route-popup-header"
              on:mousedown={startDraggingRoutePopup}
              style="cursor: move;"
            >
              <h3>Rota {ctoIndex + 1}</h3>
              <button class="route-popup-close" on:click={closeRoutePopup}>×</button>
            </div>
            <div class="route-popup-info">
              <p><strong>CTO:</strong> {cto ? cto.nome : 'N/A'}</p>
              <p><strong>Metragem:</strong> {distancia}</p>
            </div>
            <div class="route-popup-actions">
              {#if editingRouteIndex === selectedRouteIndex}
                <button 
                  class="route-popup-button finish"
                  on:click={() => finishEditingRoute(selectedRouteIndex)}
                >
                  ✓ Finalizar Edição
                </button>
              {:else}
                <button 
                  class="route-popup-button edit"
                  on:click={() => editSingleRoute(selectedRouteIndex)}
                >
                 Editar Rota
                </button>
              {/if}
            </div>
          </div>
        </div>
      {/if}
    </main>
            </div>
          </div>
        </ToolWrapper>
      {:else}
        <!-- Outras ferramentas serão renderizadas aqui dinamicamente -->
        <ToolWrapper
          toolTitle={tool.title}
          onBackToDashboard={handleBackToDashboard}
          onOpenSettings={() => {}}
          showSettingsButton={false}
        >
          <svelte:component this={tool.component} 
            currentUser={currentUser}
            userTipo={userTipo}
            onBackToDashboard={handleBackToDashboard}
          />
        </ToolWrapper>
      {/if}
    {:else}
      <div class="error-container">
        <h2>Ferramenta não encontrada</h2>
        <p>A ferramenta selecionada não está disponível.</p>
        <button on:click={handleBackToDashboard}>Voltar ao Dashboard</button>
      </div>
    {/if}
  {:else}
    <div class="error-container">
      <h2>Nenhuma ferramenta selecionada</h2>
      <button on:click={handleBackToDashboard}>Voltar ao Dashboard</button>
    </div>
  {/if}

<!-- Modal de Relatório -->
{#if showReportModal}
  <div 
    class="modal-overlay" 
    role="dialog"
    tabindex="-1"
  >
    <!-- Mensagem de pop-up bloqueado sobreposta ao modal -->
    {#if showPopupInstructions}
      <div 
        class="popup-instructions-overlay" 
        on:click|stopPropagation
        on:keydown={(e) => e.key === 'Enter' && e.stopPropagation()}
        role="dialog"
        tabindex="0"
        aria-modal="true"
      >
        <div class="popup-instructions">
          <div class="popup-instructions-header">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" fill="#FF9800"/>
            </svg>
            <h3>Pop-ups bloqueados pelo navegador</h3>
          </div>
          <div class="popup-instructions-content">
            <p>Para gerar o PDF, é necessário permitir pop-ups para este site.</p>
            <div class="popup-instructions-steps">
              <h4>Como permitir pop-ups:</h4>
              <div class="instruction-step">
                <strong>Chrome/Edge:</strong>
                <ol>
                  <li>Clique no ícone de bloqueio de pop-ups na barra de endereços</li>
                  <li>Selecione "Sempre permitir pop-ups e redirecionamentos"</li>
                  <li>Clique em "Concluído"</li>
                  <li>Tente gerar o PDF novamente</li>
                </ol>
              </div>
              <div class="instruction-step">
                <strong>Firefox:</strong>
                <ol>
                  <li>Clique no ícone de bloqueio na barra de endereços</li>
                  <li>Marque "Permitir pop-ups"</li>
                  <li>Tente gerar o PDF novamente</li>
                </ol>
              </div>
              <div class="instruction-step">
                <strong>Safari:</strong>
                <ol>
                  <li>Vá em Safari → Preferências → Sites</li>
                  <li>Selecione "Pop-ups" no menu lateral</li>
                  <li>Encontre este site e selecione "Permitir"</li>
                  <li>Tente gerar o PDF novamente</li>
                </ol>
              </div>
            </div>
            <button class="popup-instructions-close" on:click={() => showPopupInstructions = false}>
              Entendi, fechar
            </button>
          </div>
        </div>
      </div>
    {/if}
    
    <div 
      class="modal-content" 
      on:click|stopPropagation
      on:keydown={(e) => e.stopPropagation()}
      role="dialog"
      tabindex="0"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <div class="modal-header">
        <h2 id="modal-title">Preencher Relatório</h2>
        <button class="modal-close" on:click={closeReportModal} aria-label="Fechar modal">×</button>
      </div>

      <div class="modal-body">
        <form on:submit|preventDefault={exportToPDF}>
          <!-- 1. Número do ALA -->
          <div class="form-group">
            <label for="numeroALA">1. Número do ALA <span class="required">*</span></label>
            <input 
              type="text" 
              id="numeroALA"
              value={reportForm.numeroALA}
              on:input={handleNumeroALAInput}
              placeholder="Digite apenas números"
              class:error={reportFormErrors.numeroALA}
            />
            {#if reportFormErrors.numeroALA}
              <span class="error-message">{reportFormErrors.numeroALA}</span>
            {/if}
          </div>

          <!-- 2. Cidade -->
          <div class="form-group">
            <label for="cidade">2. Cidade <span class="required">*</span></label>
            <input 
              type="text" 
              id="cidade"
              bind:value={reportForm.cidade}
              on:input={() => validateField('cidade')}
              placeholder="Cidade"
              class:error={reportFormErrors.cidade}
            />
            {#if reportFormErrors.cidade}
              <span class="error-message">{reportFormErrors.cidade}</span>
            {/if}
          </div>

          <!-- 3. Endereço Completo -->
          <div class="form-group">
            <label for="enderecoCompleto">3. Endereço Completo <span class="required">*</span></label>
            <input 
              type="text" 
              id="enderecoCompleto"
              bind:value={reportForm.enderecoCompleto}
              on:input={() => validateField('enderecoCompleto')}
              placeholder="Endereço completo"
              class:error={reportFormErrors.enderecoCompleto}
            />
            {#if reportFormErrors.enderecoCompleto}
              <span class="error-message">{reportFormErrors.enderecoCompleto}</span>
            {/if}
          </div>

          <!-- 4. Número do Endereço -->
          <div class="form-group">
            <label for="numeroEndereco">4. Número do Endereço <span class="required">*</span></label>
            <input 
              type="text" 
              id="numeroEndereco"
              bind:value={reportForm.numeroEndereco}
              on:input={() => validateField('numeroEndereco')}
              placeholder="Número do endereço"
              class:error={reportFormErrors.numeroEndereco}
            />
            {#if reportFormErrors.numeroEndereco}
              <span class="error-message">{reportFormErrors.numeroEndereco}</span>
            {/if}
          </div>

          <!-- 5. CEP do Endereço -->
          <div class="form-group">
            <label for="cep">5. CEP do Endereço <span class="required">*</span></label>
            <input 
              type="text" 
              id="cep"
              bind:value={reportForm.cep}
              on:input={() => validateField('cep')}
              placeholder="CEP"
              class:error={reportFormErrors.cep}
            />
            {#if reportFormErrors.cep}
              <span class="error-message">{reportFormErrors.cep}</span>
            {/if}
          </div>

          <!-- 6. Tabulação Final -->
          <div class="form-group">
            <label for="tabulacaoFinal">6. Tabulação Final <span class="required">*</span></label>
            <select 
              id="tabulacaoFinal"
              bind:value={reportForm.tabulacaoFinal}
              on:change={() => validateField('tabulacaoFinal')}
              class:error={reportFormErrors.tabulacaoFinal}
            >
              <option value="" disabled>Selecione uma opção</option>
              {#each tabulacoesList as tabulacao}
                <option value={tabulacao}>{tabulacao}</option>
              {/each}
            </select>
            {#if reportFormErrors.tabulacaoFinal}
              <span class="error-message">{reportFormErrors.tabulacaoFinal}</span>
            {/if}
          </div>

          <!-- 7. Projetista -->
          <div class="form-group">
            <label for="projetista">7. Projetista <span class="required">*</span></label>
            <input 
              type="text" 
              id="projetista"
              bind:value={reportForm.projetista}
              readonly
              class:error={reportFormErrors.projetista}
              style="background-color: #f5f5f5; cursor: not-allowed;"
            />
            {#if reportFormErrors.projetista}
              <span class="error-message">{reportFormErrors.projetista}</span>
            {/if}
          </div>

          <!-- 8. Prévia do Mapa -->
          <div class="form-group">
            <label for="map-preview-area">8. Prévia do Mapa <span class="required">*</span></label>
            <div class="map-preview-container">
              {#if capturingMap}
                <div class="preview-loading">
                  <div class="loading-spinner"></div>
                  <p style="text-align: center; color: #7B68EE; margin-top: 1rem; font-weight: 600;">
                    Capturando mapa...
                  </p>
                </div>
              {:else if mapPreviewImage}
                <div class="preview-image-wrapper">
                  <img src={mapPreviewImage} alt="Prévia do Mapa" class="preview-image" />
                </div>
                <p style="font-size: 0.85rem; color: #666; margin-top: 0.5rem; font-style: italic; text-align: center;">
                  O mapa foi capturado automaticamente com todas as CTOs encontradas e suas rotas visíveis.
                </p>
              {:else}
                <div class="preview-error">
                  <p style="text-align: center; color: #F44336; padding: 2rem;">
                    ⚠️ Erro ao capturar mapa. Por favor, feche e abra o modal novamente.
                  </p>
                </div>
              {/if}
              
              {#if Object.keys(reportFormErrors).length > 0}
                {@const missingFields = getMissingRequiredFields()}
                {#if missingFields.length > 0}
                  <div style="margin-top: 1rem; padding: 0.75rem; background-color: #ffebee; border: 1px solid #F44336; border-radius: 4px;">
                    <p style="color: #F44336; font-weight: 600; margin: 0 0 0.5rem 0; font-size: 0.9rem;">
                      ⚠️ Campos obrigatórios não preenchidos:
                    </p>
                    <ul style="color: #F44336; margin: 0; padding-left: 1.5rem; font-size: 0.85rem;">
                      {#each missingFields as field}
                        <li style="margin-bottom: 0.25rem;">{field}</li>
                      {/each}
                    </ul>
                  </div>
                {/if}
              {/if}
            </div>
          </div>

          <div class="modal-actions">
            <button type="button" class="btn-cancel" on:click={closeReportModal}>Cancelar</button>
            <button type="submit" class="btn-submit" disabled={generatingPDF}>
              {generatingPDF ? '⏳ Gerando PDF...' : 'Gerar Relatório'}
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
{/if}

<!-- Modal de Trocar Senha do Usuário -->
{#if showChangePasswordModal}
  <div 
    class="modal-overlay" 
    role="dialog"
    tabindex="-1"
  >
    <div 
      class="modal-content add-projetista-modal" 
      on:click|stopPropagation
      on:keydown={(e) => e.stopPropagation()}
      role="dialog"
      tabindex="0"
      aria-modal="true"
      aria-labelledby="change-password-title"
    >
      <div class="modal-header">
        <h2 id="change-password-title">Alterar Dados - {currentUser}</h2>
        <button class="modal-close" on:click={closeChangePasswordModal} aria-label="Fechar modal">×</button>
      </div>

      <div class="modal-body">
        <!-- Seção de Alterar Nome -->
        <div style="margin-bottom: 2rem; padding-bottom: 2rem; border-bottom: 1px solid #e0e0e0;">
          <h3 class="settings-section-title">Alterar Nome do Usuário</h3>
          <form on:submit|preventDefault={changeUserName}>
            <div class="form-group">
              <label for="newUserName">Novo Nome <span class="required">*</span></label>
              <input 
                type="text" 
                id="newUserName"
                bind:value={newUserName}
                placeholder="Digite o novo nome"
                required
                class:error={changeUserNameError && !newUserName.trim()}
              />
            </div>

            {#if changeUserNameError}
              <div class="error-message-modal">
                {changeUserNameError}
              </div>
            {/if}

            {#if changeUserNameSuccess}
              <div class="success-message-modal">
                ✅ Nome alterado com sucesso!
              </div>
            {/if}

            <div class="modal-actions" style="margin-top: 1rem;">
              <button type="submit" class="btn-add-confirm">
                Alterar Nome
              </button>
            </div>
          </form>
        </div>

        <!-- Seção de Alterar Senha -->
        <div>
          <h3 class="settings-section-title">Alterar Senha</h3>
          <form on:submit|preventDefault={changeUserPassword}>
            <div class="form-group">
              <label for="newPasswordUser">Nova Senha <span class="required">*</span></label>
            <div class="password-input-wrapper">
              {#if showChangePassword}
                <input 
                  type="text"
                  id="newPasswordUser"
                  bind:value={newPassword}
                  placeholder="Digite a nova senha"
                  required
                  class:error={changePasswordError && !newPassword.trim()}
                />
              {:else}
                <input 
                  type="password"
                  id="newPasswordUser"
                  bind:value={newPassword}
                  placeholder="Digite a nova senha"
                  required
                  class:error={changePasswordError && !newPassword.trim()}
                />
              {/if}
              <button 
                type="button"
                class="password-toggle"
                on:click={() => showChangePassword = !showChangePassword}
                aria-label={showChangePassword ? 'Ocultar senha' : 'Mostrar senha'}
                title={showChangePassword ? 'Ocultar senha' : 'Mostrar senha'}
              >
                {#if showChangePassword}
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    <circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                {:else}
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    <line x1="1" y1="1" x2="23" y2="23" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                {/if}
              </button>
            </div>
          </div>

          <div class="form-group">
            <label for="confirmPasswordUser">Confirmar Nova Senha <span class="required">*</span></label>
            <div class="password-input-wrapper">
              {#if showConfirmPassword}
                <input 
                  type="text"
                  id="confirmPasswordUser"
                  bind:value={confirmPassword}
                  placeholder="Digite a senha novamente"
                  required
                  class:error={changePasswordError && newPassword !== confirmPassword}
                />
              {:else}
                <input 
                  type="password"
                  id="confirmPasswordUser"
                  bind:value={confirmPassword}
                  placeholder="Digite a senha novamente"
                  required
                  class:error={changePasswordError && newPassword !== confirmPassword}
                />
              {/if}
              <button 
                type="button"
                class="password-toggle"
                on:click={() => showConfirmPassword = !showConfirmPassword}
                aria-label={showConfirmPassword ? 'Ocultar senha' : 'Mostrar senha'}
                title={showConfirmPassword ? 'Ocultar senha' : 'Mostrar senha'}
              >
                {#if showConfirmPassword}
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    <circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                {:else}
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    <line x1="1" y1="1" x2="23" y2="23" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                {/if}
              </button>
            </div>
          </div>

          {#if changePasswordError}
            <div class="error-message-modal">
              {changePasswordError}
            </div>
          {/if}

          {#if changePasswordSuccess}
            <div class="success-message-modal">
              ✅ Senha alterada com sucesso!
            </div>
          {/if}

          <div class="modal-actions" style="margin-top: 1rem;">
            <button type="button" class="btn-cancel" on:click={closeChangePasswordModal}>Fechar</button>
            <button type="submit" class="btn-add-confirm">
              Alterar Senha
            </button>
          </div>
        </form>
        </div>
      </div>
    </div>
  </div>
{/if}

<!-- Modal para Adicionar Projetista -->
{#if showAddProjetistaModal}
  <div 
    class="modal-overlay" 
    on:click={closeAddProjetistaModal}
    on:keydown={(e) => e.key === 'Escape' && closeAddProjetistaModal()}
    role="button"
    tabindex="-1"
    aria-label="Fechar modal"
  >
    <div 
      class="modal-content add-projetista-modal" 
      on:click|stopPropagation
      on:keydown={(e) => e.stopPropagation()}
      role="dialog"
      tabindex="0"
      aria-modal="true"
      aria-labelledby="add-projetista-title"
    >
      <div class="modal-header">
        <h2 id="add-projetista-title">Adicionar Projetista</h2>
        <button class="modal-close" on:click={closeAddProjetistaModal} aria-label="Fechar modal">×</button>
      </div>

      <div class="modal-body">
        <div class="form-group">
          <label for="newProjetistaName">Nome do Projetista <span class="required">*</span></label>
          <input 
            type="text" 
            id="newProjetistaName"
            bind:value={newProjetistaName}
            placeholder="Digite o nome do projetista"
            on:keydown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addProjetista();
              }
            }}
          />
        </div>

        <div class="modal-actions">
          <button type="button" class="btn-cancel" on:click={closeAddProjetistaModal}>Cancelar</button>
          <button type="button" class="btn-submit" on:click={addProjetista} disabled={!newProjetistaName.trim()}>
            Adicionar
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}

<!-- Modal para Adicionar Tabulação -->
{#if showAddTabulacaoModal}
  <div 
    class="modal-overlay" 
    on:click={closeAddTabulacaoModal}
    on:keydown={(e) => e.key === 'Escape' && closeAddTabulacaoModal()}
    role="button"
    tabindex="-1"
    aria-label="Fechar modal"
  >
    <div 
      class="modal-content add-projetista-modal" 
      on:click|stopPropagation
      on:keydown={(e) => e.stopPropagation()}
      role="dialog"
      tabindex="0"
      aria-modal="true"
      aria-labelledby="add-tabulacao-title"
    >
      <div class="modal-header">
        <h2 id="add-tabulacao-title">Adicionar Tabulação</h2>
        <button class="modal-close" on:click={closeAddTabulacaoModal} aria-label="Fechar modal">×</button>
      </div>

      <div class="modal-body">
        <div class="form-group">
          <label for="newTabulacaoName">Nome da Tabulação <span class="required">*</span></label>
          <input 
            type="text" 
            id="newTabulacaoName"
            bind:value={newTabulacaoName}
            placeholder="Digite o nome da tabulação"
            on:keydown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addTabulacao();
              }
            }}
          />
        </div>

        <div class="modal-actions">
          <button type="button" class="btn-cancel" on:click={closeAddTabulacaoModal}>Cancelar</button>
          <button type="button" class="btn-submit" on:click={addTabulacao} disabled={!newTabulacaoName.trim()}>
            Adicionar
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}

<!-- Tela de Configurações -->
{#if showSettingsModal}
    <Config 
      onClose={closeSettingsModal}
      onReloadCTOs={reloadCTOsData}
      onUpdateProjetistas={(list) => { projetistasList = list; }}
      onUpdateTabulacoes={(list) => { tabulacoesList = list; }}
      baseDataExists={baseDataExists}
      userTipo={userTipo}
      currentUser={currentUser}
    />
{/if}

<style>
  :global(body) {
    margin: 0;
    padding: 0;
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
  }

  .viabilidade-content {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
  }

  .error-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100vh;
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

  /* Estilos antigos mantidos para compatibilidade com Viabilidade */
  .app-container {
    display: flex;
    flex-direction: column;
    height: 100vh;
    position: relative;
  }

  .app-container::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: linear-gradient(135deg, rgba(123, 104, 238, 0.7) 0%, rgba(100, 149, 237, 0.7) 100%);
    z-index: 0;
  }

  .app-container > * {
    position: relative;
    z-index: 1;
  }

  header {
    background: linear-gradient(135deg, rgba(123, 104, 238, 0.95) 0%, rgba(100, 149, 237, 0.95) 100%);
    color: white;
    padding: 1rem 2rem;
    box-shadow: 0 4px 6px rgba(0,0,0,0.2);
    backdrop-filter: blur(10px);
    display: flex;
    justify-content: space-between;
    align-items: center;
    position: relative;
    z-index: 1000;
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  .back-button {
    background: rgba(255, 255, 255, 0.15);
    border: 1.5px solid rgba(255, 255, 255, 0.25);
    border-radius: 10px;
    padding: 0.625rem;
    cursor: pointer;
    color: white;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    backdrop-filter: blur(10px);
  }

  .back-button:hover {
    background: rgba(255, 255, 255, 0.25);
    border-color: rgba(255, 255, 255, 0.4);
    transform: translateX(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  }

  .back-button:active {
    transform: translateX(0);
  }

  header h1 {
    margin: 0;
    font-size: 1.5rem;
    font-weight: 600;
  }

  .settings-button {
    background: none;
    border: none;
    color: white;
    font-size: 1.5rem;
    padding: 0;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: transform 0.3s ease;
    position: relative;
    z-index: 1001;
  }

  /* Gira quando o usuário passar o mouse ou clicar */
  .settings-button:hover,
  .settings-button:active {
    animation: rotateOnce 0.5s ease-in-out;
  }

  @keyframes rotateOnce {
    0% {
      transform: rotate(0deg);
    }
    100% {
      transform: rotate(45deg);
    }
  }

  .main-content {
    display: flex;
    flex: 1;
    overflow: hidden;
  }

  .sidebar {
    width: 400px;
    background: rgba(255, 255, 255, 0.95);
    box-shadow: 2px 0 8px rgba(0,0,0,0.15);
    backdrop-filter: blur(10px);
    position: relative;
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
  }

  .search-section {
    flex: 1;
    overflow-y: auto;
    padding: 1.5rem;
    padding-bottom: 1.5rem;
  }


  .search-section h2 {
    margin-top: 0;
    font-size: 1.2rem;
    color: #7B68EE;
    font-weight: 600;
  }

  .mode-selector {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 1rem;
  }

  .mode-selector button {
    flex: 1;
    padding: 0.625rem;
    border: 1px solid #E0E0E0;
    background: white;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.2s;
    font-weight: 500;
    font-size: 0.9rem;
  }

  .mode-selector button.active {
    background: linear-gradient(135deg, #7B68EE 0%, #6495ED 100%);
    color: white;
    border-color: #7B68EE;
  }

  .mode-selector button:hover {
    border-color: #7B68EE;
  }

  .input-group {
    margin-bottom: 1rem;
  }

  .input-group label {
    display: block;
    margin-bottom: 0.5rem;
    font-weight: 500;
    color: #7B68EE;
  }

  .input-group input {
    width: 100%;
    padding: 0.75rem;
    border: 1px solid #ddd;
    border-radius: 6px;
    font-size: 1rem;
    box-sizing: border-box;
  }

  .input-group input:focus {
    outline: none;
    border-color: #7B68EE;
    box-shadow: 0 0 0 3px rgba(123, 104, 238, 0.1);
  }

  .search-button {
    width: 100%;
    padding: 0.75rem;
    background: linear-gradient(135deg, #7B68EE 0%, #6495ED 100%);
    color: white;
    border: none;
    border-radius: 8px;
    font-size: 1rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.3s;
    box-shadow: 0 4px 6px rgba(123, 104, 238, 0.3);
    margin-bottom: 0.75rem;
  }

  .search-button:hover:not(:disabled) {
    background: linear-gradient(135deg, #9370DB 0%, #7B9EE8 100%);
    transform: translateY(-2px);
    box-shadow: 0 6px 12px rgba(123, 104, 238, 0.4);
  }

  .search-button:disabled {
    background: #ccc;
    cursor: not-allowed;
  }

  /* Popup de informações da rota */
  .route-popup {
    position: fixed;
    z-index: 1000;
    pointer-events: none;
  }

  .route-popup-content {
    background: white;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    padding: 1rem;
    min-width: 250px;
    pointer-events: all;
    user-select: none;
  }

  .route-popup-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.75rem;
    padding-bottom: 0.5rem;
    border-bottom: 1px solid #e0e0e0;
    user-select: none;
  }
  
  .route-popup-header:active {
    cursor: grabbing;
  }

  .route-popup-header h3 {
    margin: 0;
    font-size: 1.1rem;
    color: #333;
  }

  .route-popup-close {
    background: none;
    border: none;
    font-size: 1.5rem;
    color: #999;
    cursor: pointer;
    padding: 0;
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    line-height: 1;
  }

  .route-popup-close:hover {
    color: #333;
  }

  .route-popup-info {
    margin-bottom: 0.75rem;
  }

  .route-popup-info p {
    margin: 0.5rem 0;
    font-size: 0.9rem;
    color: #666;
  }

  .route-popup-info strong {
    color: #333;
  }

  .route-popup-actions {
    display: flex;
    gap: 0.5rem;
  }

  .route-popup-button {
    flex: 1;
    padding: 0.5rem 1rem;
    border: none;
    border-radius: 6px;
    font-size: 0.9rem;
    cursor: pointer;
    transition: all 0.3s;
  }

  .route-popup-button.edit {
    background: linear-gradient(135deg, #7B68EE 0%, #6495ED 100%);
    color: white;
  }

  .route-popup-button.edit:hover {
    background: linear-gradient(135deg, #9370DB 0%, #7B9EE8 100%);
    transform: translateY(-1px);
    box-shadow: 0 4px 8px rgba(123, 104, 238, 0.3);
  }

  .route-popup-button.finish {
    background: linear-gradient(135deg, #F44336 0%, #E53935 100%);
    color: white;
  }

  .route-popup-button.finish:hover {
    background: linear-gradient(135deg, #EF5350 0%, #E53935 100%);
    transform: translateY(-1px);
    box-shadow: 0 4px 8px rgba(244, 67, 54, 0.3);
  }

  .error-message {
    margin-top: 1rem;
    padding: 0.75rem;
    background: #ffebee;
    color: #c62828;
    border-radius: 4px;
    border-left: 4px solid #c62828;
  }

  .popup-instructions-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.7);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10001;
    padding: 2rem;
  }

  .popup-instructions {
    background: linear-gradient(135deg, #fff3e0 0%, #ffe0b2 100%);
    border: 2px solid #FF9800;
    border-radius: 8px;
    padding: 1.5rem;
    box-shadow: 0 4px 12px rgba(255, 152, 0, 0.2);
    max-width: 600px;
    max-height: 90vh;
    overflow-y: auto;
    position: relative;
  }

  .popup-instructions-header {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-bottom: 1rem;
  }

  .popup-instructions-header h3 {
    margin: 0;
    color: #E65100;
    font-size: 1.1rem;
    font-weight: 600;
  }

  .popup-instructions-content {
    color: #5D4037;
  }

  .popup-instructions-content > p {
    margin: 0 0 1rem 0;
    font-size: 1rem;
    font-weight: 500;
  }

  .popup-instructions-steps {
    margin: 1rem 0;
  }

  .popup-instructions-steps h4 {
    margin: 0 0 0.75rem 0;
    color: #E65100;
    font-size: 0.95rem;
    font-weight: 600;
  }

  .instruction-step {
    margin-bottom: 1rem;
    padding: 0.75rem;
    background: white;
    border-radius: 6px;
    border-left: 3px solid #FF9800;
  }

  .instruction-step strong {
    display: block;
    margin-bottom: 0.5rem;
    color: #E65100;
    font-size: 0.9rem;
  }

  .instruction-step ol {
    margin: 0.5rem 0 0 1.25rem;
    padding: 0;
  }

  .instruction-step li {
    margin-bottom: 0.4rem;
    font-size: 0.9rem;
    line-height: 1.4;
    color: #5D4037;
  }

  .popup-instructions-close {
    margin-top: 1rem;
    padding: 0.75rem 1.5rem;
    background: linear-gradient(135deg, #FF9800 0%, #F57C00 100%);
    color: white;
    border: none;
    border-radius: 6px;
    font-size: 0.95rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.3s;
    box-shadow: 0 2px 6px rgba(255, 152, 0, 0.3);
  }

  .popup-instructions-close:hover {
    background: linear-gradient(135deg, #F57C00 0%, #E65100 100%);
    transform: translateY(-1px);
    box-shadow: 0 4px 8px rgba(255, 152, 0, 0.4);
  }

  .results-info {
    margin-top: 1rem;
    padding: 0.6rem 1rem;
    background: linear-gradient(135deg, rgba(123, 104, 238, 0.15) 0%, rgba(100, 149, 237, 0.15) 100%);
    border-radius: 8px;
    border-left: 4px solid #7B68EE;
    color: #5A4FCF;
  }

  .results-info p {
    margin: 0;
    padding: 0;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .results-info strong {
    color: #7B68EE;
  }

  .base-data-warning {
    margin: 1rem;
    padding: 1.25rem;
    background: linear-gradient(135deg, rgba(244, 67, 54, 0.1) 0%, rgba(255, 152, 0, 0.1) 100%);
    border: 2px solid #F44336;
    border-radius: 8px;
    display: flex;
    gap: 1rem;
    align-items: flex-start;
    box-shadow: 0 2px 8px rgba(244, 67, 54, 0.2);
  }

  .warning-icon {
    font-size: 2rem;
    flex-shrink: 0;
    line-height: 1;
  }

  .warning-content h3 {
    margin: 0 0 0.5rem 0;
    color: #F44336;
    font-size: 1.1rem;
    font-weight: 600;
  }

  .warning-content p {
    margin: 0;
    color: #333;
    font-size: 0.95rem;
    line-height: 1.5;
  }

  .info-icon {
    background: none;
    border: none;
    cursor: pointer;
    font-size: 1rem;
    padding: 0;
    margin: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    opacity: 0.8;
    transition: all 0.2s ease;
    flex-shrink: 0;
  }

  .info-icon svg {
    width: 100%;
    height: 100%;
    transition: all 0.2s ease;
  }

  .info-icon:hover {
    opacity: 1;
    transform: scale(1.1);
  }

  .info-icon:hover svg {
    filter: brightness(1.1);
  }

  .info-icon:focus {
    outline: 2px solid #7B68EE;
    outline-offset: 2px;
    border-radius: 50%;
  }

  .info-modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
    animation: fadeIn 0.2s ease;
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  .info-modal-box {
    background: white;
    border-radius: 12px;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
    max-width: 500px;
    width: 90%;
    max-height: 90vh;
    overflow-y: auto;
    animation: slideUp 0.3s ease;
  }

  @keyframes slideUp {
    from {
      transform: translateY(20px);
      opacity: 0;
    }
    to {
      transform: translateY(0);
      opacity: 1;
    }
  }

  .info-modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1.5rem;
    border-bottom: 2px solid #7B68EE;
    background: linear-gradient(135deg, #7B68EE 0%, #6495ED 100%);
    color: white;
  }

  .info-modal-header h3 {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 600;
  }

  .info-modal-close {
    background: none;
    border: none;
    color: white;
    font-size: 2rem;
    cursor: pointer;
    padding: 0;
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    transition: background 0.3s;
  }

  .info-modal-close:hover {
    background: rgba(255, 255, 255, 0.2);
  }

  .info-modal-body {
    padding: 1.5rem;
  }

  .info-modal-body p {
    margin: 0;
    color: #333;
    line-height: 1.6;
    font-size: 1rem;
  }

  .ctos-list-container {
    margin-top: 1.5rem;
    margin-bottom: 2.5rem;
    background: rgba(255, 255, 255, 0.98);
    border-radius: 8px;
    padding: 1rem;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  }

  .user-section {
    flex-shrink: 0;
    padding: 0.875rem 1.5rem;
    background: rgba(255, 255, 255, 0.98);
    border-top: 2px solid #e8e8e8;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    box-shadow: 0 -2px 12px rgba(0, 0, 0, 0.08);
    z-index: 100;
    backdrop-filter: blur(10px);
    box-sizing: border-box;
  }

  .user-info {
    display: flex;
    align-items: center;
    gap: 0.625rem;
    flex: 1;
    min-width: 0;
  }

  .user-icon {
    font-size: 1.1rem;
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(135deg, #7B68EE 0%, #6495ED 100%);
    border-radius: 50%;
    color: white;
    flex-shrink: 0;
    box-shadow: 0 2px 6px rgba(123, 104, 238, 0.3);
  }

  .user-name {
    font-size: 0.875rem;
    font-weight: 600;
    color: #555;
  }

  .user-name.clickable {
    cursor: pointer;
    transition: all 0.2s ease;
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
    user-select: none;
    display: inline-block;
  }

  .user-name.clickable:hover {
    background: rgba(123, 104, 238, 0.1);
    color: #7B68EE;
  }

  .user-name.clickable:active {
    background: rgba(123, 104, 238, 0.2);
  }

  .logout-button {
    padding: 0.625rem 1.125rem;
    background: linear-gradient(135deg, #7B68EE 0%, #6495ED 100%);
    color: white;
    border: none;
    border-radius: 6px;
    font-size: 0.875rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
    box-shadow: 0 2px 6px rgba(123, 104, 238, 0.25);
    font-family: 'Inter', sans-serif;
    flex-shrink: 0;
    white-space: nowrap;
  }

  .logout-button:hover {
    background: linear-gradient(135deg, #6B5BEE 0%, #5A8FE8 100%);
    transform: translateY(-1px);
    box-shadow: 0 4px 10px rgba(123, 104, 238, 0.35);
  }

  .logout-button:active {
    transform: translateY(0);
    box-shadow: 0 2px 4px rgba(123, 104, 238, 0.3);
  }


  .ctos-list {
    max-height: 400px;
    overflow-y: auto;
    padding-right: 0.5rem;
  }

  .ctos-list::-webkit-scrollbar {
    width: 6px;
  }

  .ctos-list::-webkit-scrollbar-track {
    background: #f1f1f1;
    border-radius: 3px;
  }

  .ctos-list::-webkit-scrollbar-thumb {
    background: #7B68EE;
    border-radius: 3px;
  }

  .cto-item {
    background: white;
    border: 1px solid #E0E0E0;
    border-radius: 6px;
    padding: 1rem;
    margin-bottom: 0.75rem;
    transition: all 0.2s ease;
  }

  .cto-item:hover {
    box-shadow: 0 2px 8px rgba(123, 104, 238, 0.2);
    border-color: #7B68EE;
  }

  .cto-header {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-bottom: 0.75rem;
    padding-bottom: 0.75rem;
    border-bottom: 2px solid #7B68EE;
  }

  .cto-number {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    color: white;
    border-radius: 50%;
    font-weight: 700;
    font-size: 0.9rem;
  }

  .cto-name {
    font-weight: 600;
    color: #7B68EE;
    font-size: 1rem;
  }

  .cto-details {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.5rem;
  }

  .cto-row {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .cto-label {
    font-size: 0.75rem;
    color: #666;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .cto-value {
    font-size: 0.9rem;
    color: #333;
    font-weight: 600;
  }

  @media (max-width: 768px) {
    .cto-details {
      grid-template-columns: 1fr;
    }

  }

  .map-container {
    flex: 1;
    position: relative;
  }

  #map {
    width: 100%;
    height: 100%;
  }

  /* Modal de Relatório */
  .modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.6);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
    padding: 20px;
  }

  .modal-content {
    background: white;
    border-radius: 12px;
    max-width: 600px;
    width: 100%;
    max-height: 90vh;
    overflow-y: auto;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
  }

  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1.5rem;
    border-bottom: 2px solid #7B68EE;
    background: linear-gradient(135deg, #7B68EE 0%, #6495ED 100%);
    color: white;
  }

  .modal-header h2 {
    margin: 0;
    font-size: 1.5rem;
    font-weight: 600;
  }

  .modal-close {
    background: none;
    border: none;
    color: white;
    font-size: 2rem;
    cursor: pointer;
    padding: 0;
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    transition: background 0.3s;
  }

  .modal-close:hover {
    background: rgba(255, 255, 255, 0.2);
  }

  .modal-body {
    padding: 1.5rem;
  }

  .form-group {
    margin-bottom: 1.5rem;
  }

  .form-group label {
    display: block;
    margin-bottom: 0.5rem;
    font-weight: 600;
    color: #333;
    font-size: 0.95rem;
  }

  .required {
    color: #F44336;
  }

  .form-group input,
  .form-group select {
    width: 100%;
    padding: 0.75rem;
    border: 2px solid #ddd;
    border-radius: 6px;
    font-size: 1rem;
    font-family: 'Inter', sans-serif;
    transition: border-color 0.3s;
    box-sizing: border-box;
  }

  .form-group input:focus,
  .form-group select:focus {
    outline: none;
    border-color: #7B68EE;
    box-shadow: 0 0 0 3px rgba(123, 104, 238, 0.1);
  }

  .form-group input.error,
  .form-group select.error {
    border-color: #F44336;
  }

  .error-message {
    display: block;
    color: #F44336;
    font-size: 0.85rem;
    margin-top: 0.25rem;
  }

  .password-input-wrapper {
    position: relative;
    display: flex;
    align-items: center;
  }

  .password-input-wrapper input {
    padding-right: 3rem;
  }

  .password-toggle {
    position: absolute;
    right: 0.75rem;
    background: none;
    border: none;
    cursor: pointer;
    padding: 0.25rem;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #718096;
    transition: all 0.2s ease;
  }

  .password-toggle:hover {
    color: #7B68EE;
  }

  .password-toggle svg {
    width: 20px;
    height: 20px;
  }

  .error-message-modal {
    background: #ffebee;
    border: 1px solid #F44336;
    color: #C53030;
    padding: 0.75rem;
    border-radius: 6px;
    font-size: 0.875rem;
    margin-bottom: 1rem;
  }

  .success-message-modal {
    background: #e8f5e9;
    border: 1px solid #4caf50;
    color: #2e7d32;
    padding: 0.75rem;
    border-radius: 6px;
    font-size: 0.875rem;
    margin-bottom: 1rem;
    font-weight: 500;
  }

  .modal-actions {
    display: flex;
    gap: 1rem;
    justify-content: flex-end;
    margin-top: 2rem;
    padding-top: 1.5rem;
    border-top: 1px solid #ddd;
  }

  .btn-cancel,
  .btn-submit {
    padding: 0.75rem 1.5rem;
    border: none;
    border-radius: 6px;
    font-size: 1rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.3s;
    font-family: 'Inter', sans-serif;
  }

  .btn-cancel {
    background: #e0e0e0;
    color: #333;
  }

  .btn-cancel:hover {
    background: #d0d0d0;
  }

  .btn-submit {
    background: linear-gradient(135deg, #7B68EE 0%, #6495ED 100%);
    color: white;
  }

  .btn-submit:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(123, 104, 238, 0.4);
  }

  /* Estilos para prévia do mapa */
  .map-preview-container {
    width: 100%;
    margin-top: 0.5rem;
  }

  .preview-image-wrapper {
    position: relative;
    display: inline-block;
    width: auto;
    max-width: 100%;
    border: 2px solid #ddd;
    border-radius: 6px;
    overflow: hidden;
    background: #f9f9f9;
  }

  .preview-image {
    display: block;
    width: auto;
    height: auto;
    max-width: 100%;
  }



  .preview-loading {
    padding: 3rem 2rem;
    text-align: center;
    background: #f5f5f5;
    border: 2px dashed #ddd;
    border-radius: 6px;
  }

  .loading-spinner {
    border: 4px solid #f3f3f3;
    border-top: 4px solid #7B68EE;
    border-radius: 50%;
    width: 40px;
    height: 40px;
    animation: spin 1s linear infinite;
    margin: 0 auto;
  }

  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }

  .preview-error {
    padding: 2rem;
    background: #ffebee;
    border: 2px solid #F44336;
    border-radius: 6px;
  }

  .add-projetista-modal {
    max-width: 400px;
  }

  .settings-section-title {
    color: #7B68EE;
    font-size: 1.2rem;
    font-weight: 600;
    margin: 0 0 1.5rem 0;
    padding-bottom: 0.75rem;
    border-bottom: 2px solid #7B68EE;
  }

  .btn-add-confirm {
    background: linear-gradient(135deg, #7B68EE 0%, #6495ED 100%);
    color: white;
    border: none;
    border-radius: 6px;
    padding: 0.75rem 1.5rem;
    font-size: 1rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
    font-family: 'Inter', sans-serif;
  }

  .btn-add-confirm:hover {
    background: linear-gradient(135deg, #8B7AE8 0%, #7499F0 100%);
    transform: translateY(-2px);
    box-shadow: 0 4px 8px rgba(123, 104, 238, 0.3);
  }

  .btn-add-confirm:active {
    transform: translateY(0);
  }
</style>
