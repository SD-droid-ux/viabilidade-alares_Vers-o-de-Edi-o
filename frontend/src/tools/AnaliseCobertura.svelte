<script>
  import { onMount, onDestroy, tick } from 'svelte';
  import { Loader } from '@googlemaps/js-api-loader';
  import Loading from '../Loading.svelte';
  import { getApiUrl } from '../config.js';

  // Props do componente
  export let currentUser = '';
  export let userTipo = 'user';
  export let onBackToDashboard = () => {};
  export let onSettingsRequest = null;
  export let onSettingsHover = null;

  // Estados da ferramenta
  let isLoading = false; // Loading inicial da ferramenta (tela completa)
  let loadingMessage = '';
  let showSettingsModal = false;
  let loadingCTOs = false; // Loading específico para busca de CTOs (inline)
  let baseDataExists = true; // Indica se a base de dados foi carregada com sucesso
  
  // Google Maps
  let map;
  let mapElement; // Referência ao elemento DOM do mapa
  let googleMapsLoaded = false;
  let mapInitialized = false;
  let isDisplayingMarkers = false; // Flag para evitar múltiplas tentativas simultâneas
  const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';
  let markers = []; // Array para armazenar marcadores das CTOs
  let searchMarker = null; // Marcador do ponto de busca (endereço/coordenadas)
  let mapObserver = null; // Observer para detectar quando o mapa fica visível
  
  // Modo de busca
  let searchMode = 'nome'; // 'nome', 'endereco', 'coordenadas'
  
  // Campos de busca
  let nomeCTO = '';
  let enderecoInput = '';
  let latitudeInput = '';
  let longitudeInput = '';
  
  // Resultados
  let ctos = [];
  let error = null;

  // Redimensionamento de boxes
  let sidebarWidth = 350; // Largura inicial da sidebar em pixels
  let mapHeightPercent = 60; // Porcentagem de altura do mapa (resto vai para tabela)
  let isResizingSidebar = false;
  let isResizingMapTable = false;
  let resizeStartX = 0;
  let resizeStartY = 0;
  let resizeStartSidebarWidth = 0;
  let resizeStartMapHeight = 0;
  
  // Função para abrir configurações
  function openSettings() {
    showSettingsModal = true;
  }

  // Função para pré-carregar configurações no hover
  function preloadSettingsData() {
    // Pré-carregar dados se necessário
  }

  // Verificar se a base de dados está disponível
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

  // Carregar biblioteca do Google Maps
  async function loadGoogleMaps() {
    // Verificar se o Google Maps já está carregado globalmente
    if (typeof google !== 'undefined' && google.maps) {
      console.log('✅ Google Maps já está carregado globalmente');
      googleMapsLoaded = true;
      return;
    }
    
    if (googleMapsLoaded) return;
    
    try {
      if (!GOOGLE_MAPS_API_KEY) {
        throw new Error('Chave da API do Google Maps não configurada');
      }
      
      // Usar as mesmas bibliotecas que ViabilidadeAlares para evitar conflitos
      const loader = new Loader({
        apiKey: GOOGLE_MAPS_API_KEY,
        version: 'weekly',
        libraries: ['places', 'geometry'] // Mesmas bibliotecas que ViabilidadeAlares
      });
      
      await loader.load();
      googleMapsLoaded = true;
      console.log('✅ Google Maps carregado');
    } catch (err) {
      // Se o erro for sobre Loader já chamado, verificar se está disponível globalmente
      if (err.message && err.message.includes('Loader must not be called again')) {
        console.warn('Google Maps Loader já foi chamado, verificando disponibilidade global...');
        if (typeof google !== 'undefined' && google.maps) {
          console.log('✅ Google Maps disponível globalmente');
          googleMapsLoaded = true;
          return;
        }
      }
      console.error('Erro ao carregar Google Maps:', err);
      throw err; // Re-throw para ser capturado por initializeTool
    }
  }

  // Inicializar o mapa (criar instância) - simplificado similar ao ViabilidadeAlares
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
      scrollwheel: true,
      gestureHandling: 'greedy'
    });
    
    mapInitialized = true;
    console.log('✅ Mapa inicializado com sucesso');
  }

  // Função de inicialização da ferramenta (chamada quando o componente é montado)
  async function initializeTool() {
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
      
      // Etapa 3: Ajuste Finais
      loadingMessage = 'Ajuste Finais';
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Etapa 4: Abrindo Ferramenta
      loadingMessage = 'Abrindo Ferramenta';
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Tudo carregado
      isLoading = false;
      
      // Aguardar o DOM atualizar antes de inicializar o mapa
      await tick();
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Agora inicializar o mapa após o elemento estar no DOM
      initMap();
    } catch (err) {
      console.error('Erro ao inicializar ferramenta:', err);
      error = 'Erro ao inicializar ferramenta: ' + err.message;
      isLoading = false;
      
      // Tentar inicializar o mapa mesmo com erro
      await tick();
      await new Promise(resolve => setTimeout(resolve, 100));
      initMap();
    }
  }

  // Função para determinar a cor do marcador baseada na porcentagem de ocupação
  function getCTOColor(pctOcup) {
    const porcentagem = parseFloat(pctOcup) || 0;
    
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

  // Limpar marcadores do mapa
  function clearMap() {
    // Limpar marcadores das CTOs
    markers.forEach(marker => {
      if (marker && marker.setMap) {
        marker.setMap(null);
      }
    });
    markers = [];
    
    // Limpar marcador de busca
    if (searchMarker) {
      searchMarker.setMap(null);
      searchMarker = null;
    }
  }

  // Função para geocodificar endereço
  function geocodeAddress(address) {
    return new Promise((resolve, reject) => {
      if (!google.maps || !google.maps.Geocoder) {
        reject(new Error('Google Maps Geocoder não está disponível'));
        return;
      }

      const geocoder = new google.maps.Geocoder();
      
      geocoder.geocode(
        { 
          address: address.trim(),
          region: 'br'
        },
        (results, status) => {
          if (status === 'OK' && results && results.length > 0) {
            resolve(results[0]);
          } else {
            reject(new Error(`Geocoding failed: ${status}`));
          }
        }
      );
    });
  }

  // Função para buscar CTOs por nome
  async function searchByNome() {
    if (!nomeCTO.trim()) {
      error = 'Por favor, insira o nome da CTO';
      return;
    }

    loadingCTOs = true;
    error = null;
    ctos = [];
    clearMap();

    try {
      // Verificar se o mapa está inicializado
      if (!map) {
        initMap();
        await tick();
        await new Promise(resolve => setTimeout(resolve, 200));
      }
      
      const response = await fetch(getApiUrl(`/api/ctos/search?nome=${encodeURIComponent(nomeCTO.trim())}`));
      const data = await response.json();

      if (data.success && data.ctos) {
        ctos = data.ctos;
        
        // Limpar marcador de busca se existir (não usado na busca por nome)
        if (searchMarker) {
          searchMarker.setMap(null);
          searchMarker = null;
        }
        
        // Aguardar um pouco para garantir que o DOM está atualizado
        await tick();
        await displayResultsOnMap();
      } else {
        error = data.error || 'Erro ao buscar CTOs';
      }
    } catch (err) {
      console.error('Erro ao buscar CTOs:', err);
      error = 'Erro ao buscar CTOs. Tente novamente.';
    } finally {
      loadingCTOs = false;
    }
  }

  // Função para buscar CTOs por endereço
  async function searchByEndereco() {
    if (!enderecoInput.trim()) {
      error = 'Por favor, insira um endereço';
      return;
    }

    loadingCTOs = true;
    error = null;
    ctos = [];
    clearMap();

    try {
      // Verificar se o Google Maps está carregado
      if (!googleMapsLoaded || !google.maps || !google.maps.Geocoder) {
        error = 'Google Maps não está carregado. Aguarde alguns instantes e tente novamente.';
        loadingCTOs = false;
        return;
      }

      // Verificar se o mapa está inicializado
      if (!map) {
        initMap();
        await tick();
        await new Promise(resolve => setTimeout(resolve, 200));
      }
      
      // Geocodificar endereço
      const result = await geocodeAddress(enderecoInput);
      const location = result.geometry.location;
      const lat = location.lat();
      const lng = location.lng();

      // Buscar CTOs próximas
      const response = await fetch(getApiUrl(`/api/ctos/nearby?lat=${lat}&lng=${lng}&radius=350`));
      const data = await response.json();

      if (data.success && data.ctos) {
        ctos = data.ctos;
        
        // Limpar marcador anterior se existir
        if (searchMarker) {
          searchMarker.setMap(null);
        }
        
        // Adicionar marcador do endereço (azul) antes de exibir CTOs
        if (map) {
          searchMarker = new google.maps.Marker({
            position: { lat, lng },
            map: map,
            title: 'Endereço pesquisado',
            icon: {
              url: 'http://maps.google.com/mapfiles/ms/icons/blue-dot.png',
              scaledSize: new google.maps.Size(32, 32)
            },
            zIndex: 999
          });
        }
        
        // Aguardar um pouco para garantir que o DOM está atualizado
        await tick();
        // Exibir CTOs no mapa (isso vai ajustar o zoom automaticamente)
        await displayResultsOnMap();
        
        // Se não houver CTOs, centralizar no endereço
        if (ctos.length === 0 && map) {
          map.setCenter({ lat, lng });
          map.setZoom(15);
        }
      } else {
        error = data.error || 'Erro ao buscar CTOs';
      }
    } catch (err) {
      console.error('Erro ao buscar por endereço:', err);
      error = err.message || 'Erro ao processar endereço. Verifique se o endereço está correto.';
    } finally {
      loadingCTOs = false;
    }
  }

  // Função para buscar CTOs por coordenadas
  async function searchByCoordenadas() {
    const lat = parseFloat(latitudeInput);
    const lng = parseFloat(longitudeInput);

    if (isNaN(lat) || isNaN(lng)) {
      error = 'Por favor, insira coordenadas válidas';
      return;
    }

    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      error = 'Coordenadas inválidas. Latitude: -90 a 90, Longitude: -180 a 180';
      return;
    }

    loadingCTOs = true;
    error = null;
    ctos = [];
    clearMap();

    try {
      // Verificar se o mapa está inicializado
      if (!map) {
        initMap();
        await tick();
        await new Promise(resolve => setTimeout(resolve, 200));
      }
      
      const response = await fetch(getApiUrl(`/api/ctos/nearby?lat=${lat}&lng=${lng}&radius=350`));
      const data = await response.json();

      if (data.success && data.ctos) {
        ctos = data.ctos;
        
        // Limpar marcador anterior se existir
        if (searchMarker) {
          searchMarker.setMap(null);
        }
        
        // Adicionar marcador das coordenadas (azul) antes de exibir CTOs
        if (map) {
          searchMarker = new google.maps.Marker({
            position: { lat, lng },
            map: map,
            title: 'Coordenadas pesquisadas',
            icon: {
              url: 'http://maps.google.com/mapfiles/ms/icons/blue-dot.png',
              scaledSize: new google.maps.Size(32, 32)
            },
            zIndex: 999
          });
        }
        
        // Aguardar um pouco para garantir que o DOM está atualizado
        await tick();
        // Exibir CTOs no mapa (isso vai ajustar o zoom automaticamente)
        await displayResultsOnMap();
        
        // Se não houver CTOs, centralizar nas coordenadas
        if (ctos.length === 0 && map) {
          map.setCenter({ lat, lng });
          map.setZoom(15);
        }
      } else {
        error = data.error || 'Erro ao buscar CTOs';
      }
    } catch (err) {
      console.error('Erro ao buscar por coordenadas:', err);
      error = 'Erro ao buscar CTOs. Tente novamente.';
    } finally {
      loadingCTOs = false;
    }
  }

  // Função principal de busca
  async function handleSearch() {
    if (searchMode === 'nome') {
      await searchByNome();
    } else if (searchMode === 'endereco') {
      await searchByEndereco();
    } else if (searchMode === 'coordenadas') {
      await searchByCoordenadas();
    }
  }

  // Função para exibir resultados no mapa (estilo ViabilidadeAlares)
  async function displayResultsOnMap() {
    if (!map || !google.maps) {
      console.error('Mapa não disponível', { map: !!map, googleMaps: !!google.maps });
      return;
    }
    
    if (ctos.length === 0) {
      console.warn('Nenhuma CTO para exibir');
      return;
    }
    
    console.log(`Exibindo ${ctos.length} CTOs no mapa`);

    // Limpar marcadores anteriores
    clearMap();

    // Evitar múltiplas tentativas simultâneas
    if (isDisplayingMarkers) {
      console.warn('Já está exibindo marcadores, ignorando chamada duplicada');
      return;
    }
    
    isDisplayingMarkers = true;

    const bounds = new google.maps.LatLngBounds();
    let markerNumber = 1; // Contador para numeração dos marcadores

    ctos.forEach((cto, index) => {
      // Validar coordenadas
      if (!cto.latitude || !cto.longitude || isNaN(cto.latitude) || isNaN(cto.longitude)) {
        console.warn(`CTO ${cto.nome} tem coordenadas inválidas:`, cto.latitude, cto.longitude);
        return;
      }
      
      const position = { lat: parseFloat(cto.latitude), lng: parseFloat(cto.longitude) };
      bounds.extend(position);

      // Determinar cor baseada na porcentagem de ocupação
      const ctoColor = getCTOColor(cto.pct_ocup || 0);
      const pctOcup = parseFloat(cto.pct_ocup) || 0;
      
      // Verificar se a CTO está ativa
      const statusCto = cto.status_cto || '';
      const isAtiva = statusCto && statusCto.toUpperCase().trim() === 'ATIVADO';

      // Configuração do ícone (círculo colorido com label numérico)
      const iconConfig = {
        path: google.maps.SymbolPath.CIRCLE,
        scale: 18,
        fillColor: ctoColor,
        fillOpacity: 1,
        strokeColor: '#000000',
        strokeWeight: 3,
        anchor: new google.maps.Point(0, 0) // Centro do círculo
      };

      try {
        // Criar marcador
        const marker = new google.maps.Marker({
          position: position,
          map: map,
          title: `${cto.nome} - ${pctOcup.toFixed(1)}% ocupado (${cto.vagas_total - cto.clientes_conectados} portas disponíveis)`,
          icon: iconConfig,
          label: {
            text: `${markerNumber}`,
            color: '#FFFFFF',
            fontSize: '14px',
            fontWeight: 'bold'
          },
          zIndex: 1000 + markerNumber,
          optimized: false
        });
        
        console.log(`Marcador ${markerNumber} criado para CTO ${cto.nome} em`, position);

        // InfoWindow com estilo similar ao ViabilidadeAlares
        let alertaHTML = '';
        if (!isAtiva) {
          alertaHTML = `
            <div style="background-color: #DC3545; color: white; padding: 12px; margin-bottom: 12px; border-radius: 4px; font-weight: bold; text-align: center;">
              ⚠️ CTO NÃO ATIVA
            </div>
          `;
        }

        const infoWindowContent = `
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
            <strong>Ocupação:</strong> ${pctOcup.toFixed(1)}%
          </div>
        `;

        const infoWindow = new google.maps.InfoWindow({
          content: infoWindowContent
        });

        marker.addListener('click', () => {
          infoWindow.open(map, marker);
        });

        markers.push(marker);
        markerNumber++;
      } catch (markerErr) {
        console.error(`Erro ao criar marcador para CTO ${cto.nome}:`, markerErr);
      }
    });

    // Ajustar zoom para mostrar todos os marcadores
    if (markers.length === 0) {
      console.warn('Nenhum marcador foi criado');
      isDisplayingMarkers = false;
      return;
    }
    
    console.log(`✅ ${markers.length} marcadores criados com sucesso`);
    
    // Aguardar um pouco para garantir que os marcadores foram renderizados
    await tick();
    await new Promise(resolve => setTimeout(resolve, 300));
    
    // Ajustar zoom para mostrar todos os marcadores
    try {
      // Forçar redimensionamento do mapa antes de ajustar zoom
      google.maps.event.trigger(map, 'resize');
      await new Promise(resolve => setTimeout(resolve, 200));
      
      if (markers.length > 1) {
        // Usar fitBounds com padding para múltiplos marcadores
        map.fitBounds(bounds, {
          top: 50,
          right: 50,
          bottom: 50,
          left: 50
        });
        console.log('Ajustando zoom para múltiplos marcadores');
      } else if (markers.length === 1) {
        // Centralizar em CTO única
        const singleCto = ctos[0];
        map.setCenter({ lat: parseFloat(singleCto.latitude), lng: parseFloat(singleCto.longitude) });
        map.setZoom(16);
        console.log('Centralizando em CTO única:', singleCto.nome);
      }
    } catch (err) {
      console.warn('Erro ao ajustar zoom:', err);
      // Se falhar, centralizar no primeiro marcador
      if (ctos.length > 0) {
        map.setCenter({ lat: parseFloat(ctos[0].latitude), lng: parseFloat(ctos[0].longitude) });
        map.setZoom(14);
      }
    }
    
    console.log('✅ Marcadores exibidos no mapa com sucesso');
    isDisplayingMarkers = false;
  }

  // Função para formatar porcentagem
  function formatPercentage(value) {
    const num = parseFloat(value) || 0;
    return num.toFixed(1) + '%';
  }

  // Funções de redimensionamento
  function startResizeSidebar(e) {
    isResizingSidebar = true;
    resizeStartX = e.clientX;
    resizeStartSidebarWidth = sidebarWidth;
    document.addEventListener('mousemove', handleResizeSidebar);
    document.addEventListener('mouseup', stopResizeSidebar);
    e.preventDefault();
  }

  function handleResizeSidebar(e) {
    if (!isResizingSidebar) return;
    const deltaX = e.clientX - resizeStartX;
    const newWidth = resizeStartSidebarWidth + deltaX;
    // Limites: mínimo 250px, máximo 600px
    sidebarWidth = Math.max(250, Math.min(600, newWidth));
    // Salvar no localStorage
    try {
      localStorage.setItem('analiseCobertura_sidebarWidth', sidebarWidth.toString());
    } catch (err) {
      console.warn('Erro ao salvar largura da sidebar:', err);
    }
  }

  function stopResizeSidebar() {
    isResizingSidebar = false;
    document.removeEventListener('mousemove', handleResizeSidebar);
    document.removeEventListener('mouseup', stopResizeSidebar);
  }

  function startResizeMapTable(e) {
    isResizingMapTable = true;
    resizeStartY = e.clientY;
    resizeStartMapHeight = mapHeightPercent;
    document.addEventListener('mousemove', handleResizeMapTable);
    document.addEventListener('mouseup', stopResizeMapTable);
    e.preventDefault();
  }

  function handleResizeMapTable(e) {
    if (!isResizingMapTable) return;
    const container = document.querySelector('.main-area');
    if (!container) return;
    
    const containerRect = container.getBoundingClientRect();
    const deltaY = e.clientY - resizeStartY;
    const deltaPercent = (deltaY / containerRect.height) * 100;
    const newHeight = resizeStartMapHeight + deltaPercent;
    
    // Limites: mínimo 30%, máximo 85%
    mapHeightPercent = Math.max(30, Math.min(85, newHeight));
    
    // Salvar no localStorage
    try {
      localStorage.setItem('analiseCobertura_mapHeightPercent', mapHeightPercent.toString());
    } catch (err) {
      console.warn('Erro ao salvar altura do mapa:', err);
    }
  }

  function stopResizeMapTable() {
    isResizingMapTable = false;
    document.removeEventListener('mousemove', handleResizeMapTable);
    document.removeEventListener('mouseup', stopResizeMapTable);
    
    // Redimensionar o mapa após ajuste
    if (map) {
      setTimeout(() => {
        google.maps.event.trigger(map, 'resize');
      }, 100);
    }
  }

  // Carregar preferências salvas
  function loadResizePreferences() {
    try {
      const savedSidebarWidth = localStorage.getItem('analiseCobertura_sidebarWidth');
      if (savedSidebarWidth) {
        sidebarWidth = parseInt(savedSidebarWidth, 10);
        if (isNaN(sidebarWidth) || sidebarWidth < 250 || sidebarWidth > 600) {
          sidebarWidth = 350;
        }
      }
      
      const savedMapHeight = localStorage.getItem('analiseCobertura_mapHeightPercent');
      if (savedMapHeight) {
        mapHeightPercent = parseFloat(savedMapHeight);
        if (isNaN(mapHeightPercent) || mapHeightPercent < 30 || mapHeightPercent > 85) {
          mapHeightPercent = 60;
        }
      }
    } catch (err) {
      console.warn('Erro ao carregar preferências de redimensionamento:', err);
    }
  }

  // Inicializar ferramenta
  onMount(async () => {
    try {
      // Carregar preferências de redimensionamento
      loadResizePreferences();
      
      // Registrar função de configurações com o parent
      if (onSettingsRequest && typeof onSettingsRequest === 'function') {
        onSettingsRequest(openSettings);
      }
      
      // Registrar função de pré-carregamento no hover
      if (onSettingsHover && typeof onSettingsHover === 'function') {
        onSettingsHover(preloadSettingsData);
      }
      
      // Inicializar a ferramenta (carrega Google Maps, verifica base, inicializa mapa)
      await initializeTool();
    } catch (err) {
      console.error('Erro ao inicializar ferramenta:', err);
      error = 'Erro ao inicializar ferramenta: ' + err.message;
      isLoading = false;
    }
  });

  // Cleanup ao desmontar
  onDestroy(() => {
    // Limpar observer do mapa se existir
    if (mapObserver) {
      mapObserver.disconnect();
      mapObserver = null;
    }
    // Limpar recursos
  });
</script>

<!-- Conteúdo da Ferramenta de Análise de Cobertura -->
<div class="analise-cobertura-content">
  {#if isLoading}
    <Loading message={loadingMessage} />
  {:else}
    <div class="main-layout">
      <!-- Painel de Busca -->
      <aside class="search-panel" style="width: {sidebarWidth}px;">
        <div class="panel-header">
          <h2>📡 Análise de Cobertura</h2>
          <p>Busque CTOs na base de dados</p>
        </div>

        <div class="search-mode-selector">
          <button 
            class="mode-button" 
            class:active={searchMode === 'nome'}
            on:click={() => searchMode = 'nome'}
          >
            Nome CTO
          </button>
          <button 
            class="mode-button" 
            class:active={searchMode === 'endereco'}
            on:click={() => searchMode = 'endereco'}
          >
            Endereço
          </button>
          <button 
            class="mode-button" 
            class:active={searchMode === 'coordenadas'}
            on:click={() => searchMode = 'coordenadas'}
          >
            Coordenadas
          </button>
        </div>

        <div class="search-form">
          {#if searchMode === 'nome'}
            <div class="form-group">
              <label for="nome-cto">Nome da CTO</label>
              <input 
                id="nome-cto"
                type="text" 
                bind:value={nomeCTO}
                placeholder="Ex: CTO123"
                on:keydown={(e) => e.key === 'Enter' && handleSearch()}
              />
            </div>
          {:else if searchMode === 'endereco'}
            <div class="form-group">
              <label for="endereco">Endereço</label>
              <input 
                id="endereco"
                type="text" 
                bind:value={enderecoInput}
                placeholder="Ex: Rua Exemplo, 123, São Paulo"
                on:keydown={(e) => e.key === 'Enter' && handleSearch()}
              />
            </div>
          {:else if searchMode === 'coordenadas'}
            <div class="form-group">
              <label for="latitude">Latitude</label>
              <input 
                id="latitude"
                type="number" 
                step="any"
                bind:value={latitudeInput}
                placeholder="Ex: -23.5505"
                on:keydown={(e) => e.key === 'Enter' && handleSearch()}
              />
            </div>
            <div class="form-group">
              <label for="longitude">Longitude</label>
              <input 
                id="longitude"
                type="number" 
                step="any"
                bind:value={longitudeInput}
                placeholder="Ex: -46.6333"
                on:keydown={(e) => e.key === 'Enter' && handleSearch()}
              />
            </div>
          {/if}

          <button class="search-button" on:click={handleSearch} disabled={loadingCTOs}>
            {#if loadingCTOs}
              ⏳ Buscando...
            {:else}
              🔍 Buscar
            {/if}
          </button>

          {#if loadingCTOs}
            <div class="loading-inline">
              <p>Buscando CTOs...</p>
            </div>
          {/if}

          {#if error}
            <div class="error-message">
              ⚠️ {error}
            </div>
          {/if}

          {#if ctos.length > 0}
            <div class="results-summary">
              ✅ {ctos.length} {ctos.length === 1 ? 'CTO encontrada' : 'CTOs encontradas'}
            </div>
          {/if}
        </div>
      </aside>

      <!-- Handle de redimensionamento vertical (sidebar) -->
      <div 
        class="resize-handle resize-handle-vertical"
        on:mousedown={startResizeSidebar}
        class:resizing={isResizingSidebar}
      >
      </div>

      <!-- Área Principal (Mapa e Tabela) -->
      <main class="main-area">
        <!-- Mapa -->
        <div class="map-container" style="flex: 0 0 {mapHeightPercent}%;">
          <div id="map" class="map" bind:this={mapElement}></div>
        </div>

        <!-- Handle de redimensionamento horizontal (mapa/tabela) -->
        <div 
          class="resize-handle resize-handle-horizontal"
          on:mousedown={startResizeMapTable}
          class:resizing={isResizingMapTable}
        >
        </div>

        <!-- Tabela de Resultados -->
        {#if ctos.length > 0}
          <div class="results-table-container" style="flex: 0 0 {100 - mapHeightPercent}%;">
            <h3>Resultados ({ctos.length})</h3>
            <div class="table-wrapper">
              <table class="results-table">
                <thead>
                  <tr>
                    <th>CTO</th>
                    <th>Cidade</th>
                    <th>POP</th>
                    <th>Portas Total</th>
                    <th>Ocupadas</th>
                    <th>Disponíveis</th>
                    <th>Ocupação</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {#each ctos as cto}
                    <tr>
                      <td><strong>{cto.nome}</strong></td>
                      <td>{cto.cidade}</td>
                      <td>{cto.pop || 'N/A'}</td>
                      <td>{cto.vagas_total}</td>
                      <td>{cto.clientes_conectados}</td>
                      <td>{cto.vagas_total - cto.clientes_conectados}</td>
                      <td>
                        <span class="occupation-badge" 
                          class:low={parseFloat(cto.pct_ocup || 0) < 50}
                          class:medium={parseFloat(cto.pct_ocup || 0) >= 50 && parseFloat(cto.pct_ocup || 0) < 80}
                          class:high={parseFloat(cto.pct_ocup || 0) >= 80}
                        >
                          {formatPercentage(cto.pct_ocup)}
                        </span>
                      </td>
                      <td>{cto.status_cto || 'N/A'}</td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          </div>
        {:else if !isLoading && !error}
          <div class="empty-state" style="flex: 0 0 {100 - mapHeightPercent}%; min-height: 0;">
            <p>🔍 Realize uma busca para ver os resultados aqui</p>
          </div>
        {/if}
      </main>
    </div>
  {/if}
</div>

<style>
  .analise-cobertura-content {
    width: 100%;
    height: 100vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: #f5f7fa;
  }

  .main-layout {
    display: flex;
    flex: 1;
    height: 100%;
    min-height: 0;
    gap: 1rem;
    padding: 1rem;
    overflow: hidden;
  }

  .search-panel {
    min-width: 250px;
    max-width: 600px;
    background: white;
    border-radius: 12px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    padding: 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    overflow-y: auto;
    flex-shrink: 0;
  }

  .panel-header h2 {
    margin: 0 0 0.5rem 0;
    color: #4c1d95;
    font-size: 1.5rem;
    font-weight: 600;
  }

  .panel-header p {
    margin: 0;
    color: #666;
    font-size: 0.875rem;
  }

  .search-mode-selector {
    display: flex;
    gap: 0.5rem;
    border-bottom: 2px solid #e5e7eb;
    padding-bottom: 0.75rem;
  }

  .mode-button {
    flex: 1;
    padding: 0.5rem;
    border: none;
    background: transparent;
    color: #666;
    cursor: pointer;
    border-radius: 6px;
    font-size: 0.875rem;
    font-weight: 500;
    transition: all 0.2s;
  }

  .mode-button:hover {
    background: #f3f4f6;
  }

  .mode-button.active {
    background: linear-gradient(135deg, #6495ED 0%, #7B68EE 100%);
    color: white;
  }

  .search-form {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .form-group label {
    font-weight: 500;
    color: #374151;
    font-size: 0.875rem;
  }

  .form-group input {
    padding: 0.75rem;
    border: 2px solid #e5e7eb;
    border-radius: 8px;
    font-size: 0.9375rem;
    transition: border-color 0.2s;
  }

  .form-group input:focus {
    outline: none;
    border-color: #6495ED;
  }

  .search-button {
    padding: 0.875rem 1.5rem;
    background: linear-gradient(135deg, #6495ED 0%, #7B68EE 100%);
    color: white;
    border: none;
    border-radius: 8px;
    font-size: 1rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
  }

  .search-button:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(100, 149, 237, 0.3);
  }

  .search-button:active {
    transform: translateY(0);
  }

  .search-button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
    transform: none;
  }

  .loading-inline {
    padding: 0.75rem;
    background: #eff6ff;
    border: 1px solid #bfdbfe;
    border-radius: 8px;
    color: #1e40af;
    font-size: 0.875rem;
    text-align: center;
  }

  .loading-inline p {
    margin: 0;
  }

  .error-message {
    padding: 0.75rem;
    background: #fee2e2;
    border: 1px solid #fecaca;
    border-radius: 8px;
    color: #991b1b;
    font-size: 0.875rem;
  }

  .results-summary {
    padding: 0.75rem;
    background: #dcfce7;
    border: 1px solid #bbf7d0;
    border-radius: 8px;
    color: #166534;
    font-size: 0.875rem;
    font-weight: 500;
    text-align: center;
  }

  .main-area {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 1rem;
    overflow: hidden;
    min-height: 0;
    height: 100%;
  }

  /* Garantir que a tabela não cresça além do necessário */
  .main-area > .results-table-container {
    flex-shrink: 1;
  }

  .map-container {
    min-height: 200px;
    max-height: 100%;
    position: relative;
    border-radius: 12px;
    overflow: hidden;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    background: #e5e7eb;
    display: flex;
    flex-direction: column;
  }

  .map {
    width: 100%;
    height: 100%;
    min-height: 500px;
    flex: 1;
    display: block;
  }
  

  .results-table-container {
    background: white;
    border-radius: 12px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    padding: 1.5rem;
    display: flex;
    flex-direction: column;
    min-height: 150px;
    max-height: 100%;
    overflow: hidden;
  }

  /* Handles de redimensionamento - estilo discreto */
  .resize-handle {
    background: transparent;
    cursor: col-resize;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.2s;
    user-select: none;
    flex-shrink: 0;
    position: relative;
  }

  .resize-handle::before {
    content: '';
    position: absolute;
    background: transparent;
    transition: background 0.2s;
  }

  .resize-handle:hover {
    background: rgba(100, 149, 237, 0.1);
  }

  .resize-handle:hover::before {
    background: rgba(100, 149, 237, 0.3);
  }

  .resize-handle.resizing {
    background: rgba(123, 104, 238, 0.2);
  }

  .resize-handle.resizing::before {
    background: rgba(123, 104, 238, 0.4);
  }

  .resize-handle-vertical {
    width: 4px;
    cursor: col-resize;
  }

  .resize-handle-vertical::before {
    width: 2px;
    height: 100%;
    left: 50%;
    transform: translateX(-50%);
  }

  .resize-handle-horizontal {
    height: 4px;
    cursor: row-resize;
    width: 100%;
  }

  .resize-handle-horizontal::before {
    height: 2px;
    width: 100%;
    top: 50%;
    transform: translateY(-50%);
  }

  .results-table-container h3 {
    margin: 0 0 1rem 0;
    color: #4c1d95;
    font-size: 1.125rem;
    font-weight: 600;
    flex-shrink: 0;
  }

  .table-wrapper {
    overflow-y: auto;
    overflow-x: auto;
    flex: 1;
    min-height: 0;
    max-height: 100%;
  }

  /* Estilizar scrollbar para melhor visualização */
  .table-wrapper::-webkit-scrollbar {
    width: 8px;
    height: 8px;
  }

  .table-wrapper::-webkit-scrollbar-track {
    background: #f1f1f1;
    border-radius: 4px;
  }

  .table-wrapper::-webkit-scrollbar-thumb {
    background: #888;
    border-radius: 4px;
  }

  .table-wrapper::-webkit-scrollbar-thumb:hover {
    background: #555;
  }

  .results-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.875rem;
  }

  .results-table thead {
    background: #f9fafb;
    position: sticky;
    top: 0;
    z-index: 10;
  }

  .results-table th {
    padding: 0.75rem;
    text-align: left;
    font-weight: 600;
    color: #374151;
    border-bottom: 2px solid #e5e7eb;
  }

  .results-table td {
    padding: 0.75rem;
    border-bottom: 1px solid #e5e7eb;
    color: #4b5563;
  }

  .results-table tbody tr:hover {
    background: #f9fafb;
  }

  .occupation-badge {
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
    font-weight: 600;
    font-size: 0.8125rem;
  }

  .occupation-badge.low {
    background: #dcfce7;
    color: #166534;
  }

  .occupation-badge.medium {
    background: #fef3c7;
    color: #92400e;
  }

  .occupation-badge.high {
    background: #fee2e2;
    color: #991b1b;
  }

  .empty-state {
    background: white;
    border-radius: 12px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    padding: 3rem;
    text-align: center;
    color: #6b7280;
  }

  /* Responsividade */
  @media (max-width: 1024px) {
    .main-layout {
      flex-direction: column;
    }

    .search-panel {
      width: 100%;
      max-height: 400px;
    }

    .main-area {
      min-height: 500px;
    }
  }

  @media (max-width: 768px) {
    .main-layout {
      padding: 0.75rem;
    }

    .search-panel {
      padding: 1rem;
    }

    .results-table {
      font-size: 0.75rem;
    }

    .results-table th,
    .results-table td {
      padding: 0.5rem;
    }
  }
</style>
