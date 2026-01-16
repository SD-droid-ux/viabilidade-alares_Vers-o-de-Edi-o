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
  let isLoading = false;
  let loadingMessage = '';
  let showSettingsModal = false;
  let loadingCTOs = false;
  let baseDataExists = true;
  
  // Google Maps
  let map;
  let mapElement;
  let googleMapsLoaded = false;
  let mapInitialized = false;
  const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';
  let coverageCircles = []; // Array para armazenar círculos de cobertura (250m de cada CTO)
  let searchMarkers = []; // Array para armazenar marcadores de busca
  let allCTOs = []; // Array para armazenar todas as CTOs carregadas
  
  // Campos de busca
  let enderecoInput = '';
  let coordenadasInput = '';
  let searchMode = 'endereco'; // 'endereco' ou 'coordenadas'
  
  // Resultados
  let error = null;
  
  // Redimensionamento de boxes
  let sidebarWidth = 400;
  let mapHeightPixels = 600;
  let isResizingSidebar = false;
  let isResizingMap = false;
  let resizeStartX = 0;
  let resizeStartY = 0;
  let resizeStartSidebarWidth = 0;
  let resizeStartMapHeight = 0;
  
  // Estados de minimização
  let isSearchPanelMinimized = false;
  let isMapMinimized = false;
  
  // Reactive statements
  $: sidebarWidthStyle = `${sidebarWidth}px`;
  $: mapHeightStyle = `${mapHeightPixels}px`;

  // Função para abrir configurações
  function openSettings() {
    showSettingsModal = true;
  }

  // Função para pré-carregar configurações no hover
  function preloadSettingsData() {
    // Pré-carregar dados se necessário
  }

  // Carregar biblioteca do Google Maps
  async function loadGoogleMaps() {
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
      
      const loader = new Loader({
        apiKey: GOOGLE_MAPS_API_KEY,
        version: 'weekly',
        libraries: ['places', 'geometry']
      });
      
      await loader.load();
      googleMapsLoaded = true;
      console.log('✅ Google Maps carregado');
    } catch (err) {
      if (err.message && err.message.includes('Loader must not be called again')) {
        console.warn('Google Maps Loader já foi chamado, verificando disponibilidade global...');
        if (typeof google !== 'undefined' && google.maps) {
          console.log('✅ Google Maps disponível globalmente');
          googleMapsLoaded = true;
          return;
        }
      }
      console.error('Erro ao carregar Google Maps:', err);
      throw err;
    }
  }

  // Inicializar o mapa
  function initMap() {
    if (!googleMapsLoaded) return;

    const mapElement = document.getElementById('map-consulta');
    if (!mapElement) return;

    // Centralizar no Brasil (Fortaleza como padrão, mas ajustará para mostrar todas as CTOs)
    map = new google.maps.Map(mapElement, {
      center: { lat: -3.7172, lng: -38.5433 }, // Fortaleza
      zoom: 12,
      mapTypeControl: true,
      streetViewControl: true,
      fullscreenControl: true,
      scrollwheel: true,
      gestureHandling: 'greedy'
    });
    
    mapInitialized = true;
    console.log('✅ Mapa inicializado com sucesso');
  }

  // Carregar todas as CTOs da base de dados
  async function loadAllCTOs() {
    try {
      loadingMessage = 'Carregando CTOs da base de dados...';
      console.log('📥 Carregando todas as CTOs...');
      
      // Estratégia: buscar CTOs em lotes por regiões do Brasil
      // Vou fazer múltiplas buscas cobrindo o território brasileiro
      const regions = [
        // Região Nordeste (incluindo Fortaleza)
        { lat: -3.7172, lng: -38.5433, radius: 500000 }, // Fortaleza e região
        { lat: -8.0476, lng: -34.8770, radius: 500000 }, // Recife e região
        { lat: -12.9714, lng: -38.5014, radius: 500000 }, // Salvador e região
        // Região Sudeste
        { lat: -23.5505, lng: -46.6333, radius: 500000 }, // São Paulo e região
        { lat: -22.9068, lng: -43.1729, radius: 500000 }, // Rio de Janeiro e região
        // Região Sul
        { lat: -30.0346, lng: -51.2177, radius: 500000 }, // Porto Alegre e região
        { lat: -25.4284, lng: -49.2733, radius: 500000 }, // Curitiba e região
        // Região Centro-Oeste
        { lat: -15.7942, lng: -47.8822, radius: 500000 }, // Brasília e região
        // Região Norte
        { lat: -3.1190, lng: -60.0217, radius: 500000 }, // Manaus e região
        { lat: -1.4558, lng: -48.5044, radius: 500000 }, // Belém e região
      ];

      const allCTOsMap = new Map(); // Usar Map para evitar duplicatas por coordenadas
      let totalFound = 0;

      // Buscar CTOs em paralelo para todas as regiões
      const regionPromises = regions.map(async (region) => {
        try {
          const response = await fetch(getApiUrl(`/api/ctos/nearby?lat=${region.lat}&lng=${region.lng}&radius=${region.radius}`));
          if (!response.ok) {
            console.warn(`⚠️ Erro ao buscar CTOs na região ${region.lat}, ${region.lng}`);
            return [];
          }
          const data = await response.json();
          if (data.success && data.ctos) {
            return data.ctos;
          }
          return [];
        } catch (err) {
          console.warn(`⚠️ Erro ao buscar CTOs na região ${region.lat}, ${region.lng}:`, err);
          return [];
        }
      });

      const regionResults = await Promise.all(regionPromises);

      // Consolidar todas as CTOs (evitando duplicatas)
      for (const ctos of regionResults) {
        for (const cto of ctos) {
          if (!cto.latitude || !cto.longitude) continue;
          
          const key = `${parseFloat(cto.latitude).toFixed(6)},${parseFloat(cto.longitude).toFixed(6)}`;
          if (!allCTOsMap.has(key)) {
            allCTOsMap.set(key, cto);
            totalFound++;
          }
        }
      }

      allCTOs = Array.from(allCTOsMap.values());
      console.log(`✅ ${allCTOs.length} CTOs únicas carregadas`);
      
      return allCTOs;
    } catch (err) {
      console.error('Erro ao carregar CTOs:', err);
      throw err;
    }
  }

  // Desenhar mancha de cobertura no mapa
  function drawCoverageArea() {
    if (!map || !google.maps || allCTOs.length === 0) {
      console.warn('Mapa não disponível ou sem CTOs para desenhar');
      return;
    }

    // Limpar círculos anteriores
    clearCoverageCircles();

    console.log(`🗺️ Desenhando mancha de cobertura com ${allCTOs.length} CTOs...`);

    const bounds = new google.maps.LatLngBounds();
    let circlesCreated = 0;

    // Criar círculo de 250m para cada CTO
    for (const cto of allCTOs) {
      if (!cto.latitude || !cto.longitude) continue;

      const lat = parseFloat(cto.latitude);
      const lng = parseFloat(cto.longitude);

      if (isNaN(lat) || isNaN(lng)) continue;

      // Adicionar ao bounds para ajustar zoom depois
      bounds.extend({ lat, lng });

      // Criar círculo de 250m (cor da paleta do projeto)
      // Apenas círculos formando a mancha de cobertura, sem marcadores
      const circle = new google.maps.Circle({
        strokeColor: '#7B68EE', // Roxo da paleta (borda)
        strokeOpacity: 0.3, // Borda mais sutil
        strokeWeight: 1,
        fillColor: '#6495ED', // Azul da paleta (preenchimento)
        fillOpacity: 0.2, // Opacidade ajustada para formar mancha visível quando sobrepostos
        map: map,
        center: { lat, lng },
        radius: 250, // 250 metros
        zIndex: 1
      });

      coverageCircles.push(circle);
      circlesCreated++;
    }

    console.log(`✅ ${circlesCreated} círculos de cobertura criados`);

    // Ajustar zoom para mostrar toda a área coberta
    if (circlesCreated > 0) {
      try {
        google.maps.event.trigger(map, 'resize');
        setTimeout(() => {
          if (map && bounds && !bounds.isEmpty()) {
            map.fitBounds(bounds, {
              top: 50,
              right: 50,
              bottom: 50,
              left: 50
            });
            console.log('✅ Zoom ajustado para mostrar toda a área de cobertura');
          }
        }, 500);
      } catch (err) {
        console.warn('Erro ao ajustar zoom:', err);
      }
    }
  }

  // Limpar círculos de cobertura
  function clearCoverageCircles() {
    coverageCircles.forEach(circle => {
      if (circle && circle.setMap) {
        circle.setMap(null);
      }
    });
    coverageCircles = [];
  }

  // Limpar marcadores de busca
  function clearSearchMarkers() {
    searchMarkers.forEach(marker => {
      if (marker && marker.setMap) {
        marker.setMap(null);
      }
    });
    searchMarkers = [];
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

  // Função para detectar se o input é coordenadas
  function parseCoordinates(input) {
    const trimmed = input.trim();
    const coordPattern = /^-?\d+\.?\d*\s*,\s*-?\d+\.?\d*$/;
    
    if (coordPattern.test(trimmed)) {
      const parts = trimmed.split(',').map(p => p.trim());
      const lat = parseFloat(parts[0]);
      const lng = parseFloat(parts[1]);
      
      if (!isNaN(lat) && !isNaN(lng) && 
          lat >= -90 && lat <= 90 && 
          lng >= -180 && lng <= 180) {
        return { isCoordinates: true, lat, lng };
      }
    }
    
    return { isCoordinates: false };
  }

  // Função de inicialização da ferramenta
  async function initializeTool() {
    isLoading = true;
    
    try {
      // Etapa 1: Carregando Mapa
      loadingMessage = 'Carregando Mapa';
      await loadGoogleMaps();
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Etapa 2: Carregando CTOs
      loadingMessage = 'Carregando CTOs da base de dados';
      await loadAllCTOs();
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Etapa 3: Ajuste Finais
      loadingMessage = 'Ajuste Finais';
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Etapa 4: Abrindo Ferramenta
      loadingMessage = 'Abrindo Ferramenta';
      await new Promise(resolve => setTimeout(resolve, 500));
      
      isLoading = false;
      
      // Aguardar DOM atualizar antes de inicializar o mapa
      await tick();
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Inicializar mapa
      initMap();
      
      // Aguardar mapa renderizar antes de desenhar cobertura
      await tick();
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // Desenhar mancha de cobertura
      drawCoverageArea();
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

  // Função para buscar por endereço
  async function searchByEndereco() {
    if (!enderecoInput.trim()) {
      error = 'Por favor, insira um endereço';
      return;
    }

    if (!map || !googleMapsLoaded || !google.maps || !google.maps.Geocoder) {
      error = 'Google Maps não está carregado. Aguarde alguns instantes e tente novamente.';
      return;
    }

    loadingCTOs = true;
    error = null;

    try {
      const result = await geocodeAddress(enderecoInput);
      const location = result.geometry.location;
      const lat = location.lat();
      const lng = location.lng();

      // Criar marcador azul no ponto pesquisado
      const marker = new google.maps.Marker({
        position: { lat, lng },
        map: map,
        title: `Endereço: ${enderecoInput}`,
        icon: {
          url: 'https://maps.google.com/mapfiles/ms/icons/blue-dot.png',
          scaledSize: new google.maps.Size(32, 32)
        },
        zIndex: 999
      });

      searchMarkers.push(marker);

      // Centralizar mapa no ponto pesquisado
      map.setCenter({ lat, lng });
      map.setZoom(16);

      console.log('✅ Marcador adicionado para endereço:', enderecoInput);
    } catch (err) {
      console.error('Erro ao buscar endereço:', err);
      error = 'Erro ao processar endereço. Verifique se o endereço está correto.';
    } finally {
      loadingCTOs = false;
    }
  }

  // Função para buscar por coordenadas
  async function searchByCoordenadas() {
    if (!coordenadasInput.trim()) {
      error = 'Por favor, insira coordenadas (lat, lng)';
      return;
    }

    if (!map || !googleMapsLoaded) {
      error = 'Mapa não está carregado. Aguarde alguns instantes e tente novamente.';
      return;
    }

    loadingCTOs = true;
    error = null;

    try {
      const parsed = parseCoordinates(coordenadasInput);
      
      if (!parsed.isCoordinates) {
        error = 'Formato de coordenadas inválido. Use: lat, lng (ex: -3.7172, -38.5433)';
        loadingCTOs = false;
        return;
      }

      const { lat, lng } = parsed;

      // Criar marcador azul no ponto pesquisado
      const marker = new google.maps.Marker({
        position: { lat, lng },
        map: map,
        title: `Coordenadas: ${lat}, ${lng}`,
        icon: {
          url: 'https://maps.google.com/mapfiles/ms/icons/blue-dot.png',
          scaledSize: new google.maps.Size(32, 32)
        },
        zIndex: 999
      });

      searchMarkers.push(marker);

      // Centralizar mapa no ponto pesquisado
      map.setCenter({ lat, lng });
      map.setZoom(16);

      console.log('✅ Marcador adicionado para coordenadas:', lat, lng);
    } catch (err) {
      console.error('Erro ao processar coordenadas:', err);
      error = 'Erro ao processar coordenadas. Verifique se estão corretas.';
    } finally {
      loadingCTOs = false;
    }
  }

  // Função principal de busca
  async function handleSearch() {
    if (searchMode === 'endereco') {
      await searchByEndereco();
    } else if (searchMode === 'coordenadas') {
      await searchByCoordenadas();
    }
  }

  // Função para limpar marcadores de busca
  function clearSearch() {
    clearSearchMarkers();
    enderecoInput = '';
    coordenadasInput = '';
    error = null;
  }

  // Funções de redimensionamento
  function startResizeSidebar(e) {
    e.preventDefault();
    e.stopPropagation();
    isResizingSidebar = true;
    resizeStartX = e.clientX || e.touches?.[0]?.clientX || 0;
    resizeStartSidebarWidth = sidebarWidth;
    document.addEventListener('mousemove', handleResizeSidebar, { passive: false, capture: true });
    document.addEventListener('mouseup', stopResizeSidebar, { passive: false, capture: true });
    document.addEventListener('touchmove', handleResizeSidebar, { passive: false, capture: true });
    document.addEventListener('touchend', stopResizeSidebar, { passive: false, capture: true });
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    return false;
  }

  function handleResizeSidebar(e) {
    if (!isResizingSidebar) return;
    e.preventDefault();
    e.stopPropagation();
    
    if (isSearchPanelMinimized) return;
    
    const clientX = e.clientX || e.touches?.[0]?.clientX || resizeStartX;
    const deltaX = clientX - resizeStartX;
    const newWidth = resizeStartSidebarWidth + deltaX;
    const clampedWidth = Math.max(300, Math.min(700, newWidth));
    
    sidebarWidth = clampedWidth;
    
    try {
      localStorage.setItem('mapaConsulta_sidebarWidth', clampedWidth.toString());
    } catch (err) {
      console.warn('Erro ao salvar largura da sidebar:', err);
    }
  }

  function stopResizeSidebar() {
    isResizingSidebar = false;
    document.removeEventListener('mousemove', handleResizeSidebar, { capture: true });
    document.removeEventListener('mouseup', stopResizeSidebar, { capture: true });
    document.removeEventListener('touchmove', handleResizeSidebar, { capture: true });
    document.removeEventListener('touchend', stopResizeSidebar, { capture: true });
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }

  function startResizeMap(e) {
    e.preventDefault();
    e.stopPropagation();
    isResizingMap = true;
    resizeStartY = e.clientY || e.touches?.[0]?.clientY || 0;
    resizeStartMapHeight = mapHeightPixels;
    document.addEventListener('mousemove', handleResizeMap, { passive: false, capture: true });
    document.addEventListener('mouseup', stopResizeMap, { passive: false, capture: true });
    document.addEventListener('touchmove', handleResizeMap, { passive: false, capture: true });
    document.addEventListener('touchend', stopResizeMap, { passive: false, capture: true });
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
    return false;
  }

  function handleResizeMap(e) {
    if (!isResizingMap) return;
    e.preventDefault();
    e.stopPropagation();
    
    const clientY = e.clientY || e.touches?.[0]?.clientY || resizeStartY;
    const deltaY = clientY - resizeStartY;
    const newHeight = resizeStartMapHeight + deltaY;
    const clampedHeight = Math.max(300, Math.min(1000, newHeight));
    
    mapHeightPixels = clampedHeight;
    
    try {
      localStorage.setItem('mapaConsulta_mapHeightPixels', clampedHeight.toString());
    } catch (err) {
      console.warn('Erro ao salvar altura do mapa:', err);
    }
    
    // Redimensionar o mapa após ajuste
    if (map) {
      setTimeout(() => {
        google.maps.event.trigger(map, 'resize');
      }, 100);
    }
  }

  function stopResizeMap() {
    isResizingMap = false;
    document.removeEventListener('mousemove', handleResizeMap, { capture: true });
    document.removeEventListener('mouseup', stopResizeMap, { capture: true });
    document.removeEventListener('touchmove', handleResizeMap, { capture: true });
    document.removeEventListener('touchend', stopResizeMap, { capture: true });
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }

  // Carregar preferências salvas
  function loadResizePreferences() {
    try {
      const savedSidebarWidth = localStorage.getItem('mapaConsulta_sidebarWidth');
      if (savedSidebarWidth) {
        sidebarWidth = parseInt(savedSidebarWidth, 10);
        if (isNaN(sidebarWidth) || sidebarWidth < 250 || sidebarWidth > 600) {
          sidebarWidth = 400;
        }
      }
      
      const savedMapHeight = localStorage.getItem('mapaConsulta_mapHeightPixels');
      if (savedMapHeight) {
        mapHeightPixels = parseInt(savedMapHeight, 10);
        if (isNaN(mapHeightPixels) || mapHeightPixels < 300 || mapHeightPixels > 1000) {
          mapHeightPixels = 600;
        }
      }
    } catch (err) {
      console.warn('Erro ao carregar preferências de redimensionamento:', err);
    }
  }

  // Inicializar ferramenta
  onMount(async () => {
    try {
      loadResizePreferences();
      
      if (onSettingsRequest && typeof onSettingsRequest === 'function') {
        onSettingsRequest(openSettings);
      }
      
      if (onSettingsHover && typeof onSettingsHover === 'function') {
        onSettingsHover(preloadSettingsData);
      }
      
      await initializeTool();
    } catch (err) {
      console.error('Erro ao inicializar ferramenta:', err);
      error = 'Erro ao inicializar ferramenta: ' + err.message;
      isLoading = false;
    }
  });

  // Cleanup ao desmontar
  onDestroy(() => {
    clearCoverageCircles();
    clearSearchMarkers();
  });
</script>

<!-- Conteúdo da Ferramenta Mapa de Consulta -->
<div class="mapa-consulta-content">
  {#if isLoading}
    <Loading message={loadingMessage} />
  {:else}
    <div class="main-layout">
      <!-- Painel de Busca -->
      <aside class="search-panel" class:minimized={isSearchPanelMinimized} style="width: {isSearchPanelMinimized ? '60px' : sidebarWidthStyle} !important; flex: 0 0 auto;">
        <div class="panel-header">
          <div class="panel-header-content">
            {#if !isSearchPanelMinimized}
              <h2>Mapa de Consulta</h2>
            {:else}
              <h2 class="vertical-title"></h2>
            {/if}
            <button 
              class="minimize-button" 
              disabled={isResizingSidebar || isResizingMap}
              on:click={() => isSearchPanelMinimized = !isSearchPanelMinimized}
              aria-label={isSearchPanelMinimized ? 'Expandir painel de busca' : 'Minimizar painel de busca'}
              title={isSearchPanelMinimized ? 'Expandir' : 'Minimizar'}
            >
              {isSearchPanelMinimized ? '➡️' : '⬅️'}
            </button>
          </div>
          {#if !isSearchPanelMinimized}
            <p>Busque por endereço ou coordenadas</p>
          {/if}
        </div>

        {#if !isSearchPanelMinimized}
        <div class="search-mode-selector">
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
          {#if searchMode === 'endereco'}
            <div class="form-group">
              <label for="endereco">Endereço</label>
              <input 
                type="text" 
                id="endereco"
                bind:value={enderecoInput}
                placeholder="Ex: Rua Exemplo, 123, Fortaleza-CE"
                on:keydown={(e) => e.key === 'Enter' && handleSearch()}
              />
            </div>
          {:else if searchMode === 'coordenadas'}
            <div class="form-group">
              <label for="coordenadas">Coordenadas (lat, lng)</label>
              <input 
                type="text" 
                id="coordenadas"
                bind:value={coordenadasInput}
                placeholder="Ex: -3.7172, -38.5433"
                on:keydown={(e) => e.key === 'Enter' && handleSearch()}
              />
            </div>
          {/if}

          <div class="button-group">
            <button class="search-button" on:click={handleSearch} disabled={loadingCTOs}>
              {#if loadingCTOs}
                ⏳ Buscando...
              {:else}
                Buscar
              {/if}
            </button>
            {#if searchMarkers.length > 0}
              <button class="clear-button" on:click={clearSearch}>
                Limpar
              </button>
            {/if}
          </div>

          {#if loadingCTOs}
            <div class="loading-inline">
              <p>Buscando localização...</p>
            </div>
          {/if}

          {#if error}
            <div class="error-message">
              ⚠️ {error}
            </div>
          {/if}

          {#if allCTOs.length > 0}
            <div class="results-summary">
              📍 {allCTOs.length} CTOs carregadas na base
            </div>
          {/if}
        </div>
        {/if}
      </aside>

      <!-- Handle de redimensionamento vertical (sidebar) -->
      <div 
        class="resize-handle resize-handle-vertical"
        on:mousedown|stopPropagation={startResizeSidebar}
        on:touchstart|stopPropagation={startResizeSidebar}
        class:resizing={isResizingSidebar}
        role="separator"
        aria-label="Ajustar largura da barra lateral"
        tabindex="0"
      >
      </div>

      <!-- Área Principal (Mapa) -->
      <main class="main-area">
        <!-- Mapa -->
        <div class="map-container" class:minimized={isMapMinimized} style="height: {isMapMinimized ? '60px' : mapHeightStyle}; flex: 0 0 auto; min-height: {isMapMinimized ? '60px' : mapHeightStyle};">
          <div class="map-header">
            <h3>Mapa de Cobertura</h3>
            <button 
              class="minimize-button" 
              disabled={isResizingSidebar || isResizingMap}
              on:click={async () => {
                isMapMinimized = !isMapMinimized;
                if (!isMapMinimized && map && google?.maps) {
                  await tick();
                  setTimeout(() => {
                    if (map && google.maps) {
                      google.maps.event.trigger(map, 'resize');
                    }
                  }, 100);
                }
              }}
              aria-label={isMapMinimized ? 'Expandir mapa' : 'Minimizar mapa'}
              title={isMapMinimized ? 'Expandir' : 'Minimizar'}
            >
              {isMapMinimized ? '⬆️' : '⬇️'}
            </button>
          </div>
          <div id="map-consulta" class="map" class:hidden={isMapMinimized} bind:this={mapElement}></div>
        </div>
      </main>
    </div>
  {/if}
</div>

<style>
  .mapa-consulta-content {
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
    gap: 0.75rem;
    padding: 1rem;
    padding-bottom: 1.75rem;
    overflow: hidden;
    align-items: flex-start;
    position: relative;
    box-sizing: border-box;
  }

  .search-panel {
    min-width: 300px !important;
    max-width: 700px !important;
    width: 400px;
    background: white;
    border-radius: 12px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    padding: 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    overflow-y: auto;
    overflow-x: hidden;
    flex: 0 0 auto;
    height: calc(100% - 2.75rem);
    box-sizing: border-box;
  }

  .panel-header {
    position: relative;
  }

  .panel-header-content {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1rem;
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

  .minimize-button {
    background: transparent;
    border: 1px solid rgba(123, 104, 238, 0.3);
    cursor: pointer;
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
    font-size: 0.75rem;
    color: #7B68EE;
    font-weight: 400;
    transition: all 0.2s;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 24px;
    height: 24px;
    box-shadow: none;
    opacity: 0.7;
  }

  .minimize-button:hover {
    opacity: 1;
    background: rgba(100, 149, 237, 0.1);
    border-color: #7B68EE;
    color: #4c1d95;
  }

  .minimize-button:active {
    background: rgba(123, 104, 238, 0.15);
    border-color: #7B68EE;
    color: #4c1d95;
    transform: scale(0.95);
  }

  .minimize-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    pointer-events: none;
  }

  .vertical-title {
    margin: 0;
    color: #4c1d95;
    font-size: 1.5rem;
    font-weight: 600;
  }

  .search-panel.minimized {
    padding: 1rem 0.75rem;
    overflow: hidden;
    min-width: 60px !important;
    max-width: 60px !important;
    align-items: center;
  }

  .search-panel.minimized .panel-header {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
  }

  .search-panel.minimized .panel-header-content {
    flex-direction: column;
    gap: 0.75rem;
    width: 100%;
  }

  .search-panel.minimized .panel-header-content h2,
  .search-panel.minimized .vertical-title {
    margin: 0;
    font-size: 1.5rem;
    writing-mode: vertical-rl;
    text-orientation: mixed;
    transform: rotate(180deg);
  }

  .search-panel.minimized .panel-header p {
    display: none;
  }

  .search-panel.minimized .minimize-button {
    width: 100%;
    min-width: auto;
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
    font-family: inherit;
    width: 100%;
    box-sizing: border-box;
  }

  .form-group input:focus {
    outline: none;
    border-color: #6495ED;
  }

  .button-group {
    display: flex;
    gap: 0.5rem;
  }

  .search-button {
    flex: 1;
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

  .clear-button {
    padding: 0.875rem 1rem;
    background: #e5e7eb;
    color: #374151;
    border: none;
    border-radius: 8px;
    font-size: 0.9375rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
  }

  .clear-button:hover {
    background: #d1d5db;
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
    flex: 1 1 auto;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    overflow: hidden;
    width: 100%;
    position: relative;
    min-height: 0;
    box-sizing: border-box;
    height: calc(100% - 2.75rem);
  }

  .map-container {
    min-height: 300px;
    position: relative;
    border-radius: 12px;
    overflow: hidden;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    background: white;
    display: flex;
    flex-direction: column;
    flex: 0 0 auto;
    width: 100%;
  }

  .map-container.minimized {
    background: white;
    min-height: 60px;
  }

  .map-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem 1.5rem;
    border-bottom: 1px solid #e5e7eb;
    background: white;
    flex-shrink: 0;
  }

  .map-header h3 {
    margin: 0;
    color: #4c1d95;
    font-size: 1.125rem;
    font-weight: 600;
  }

  .map-container.minimized .map-header {
    border-bottom: none;
  }

  .map {
    width: 100%;
    height: 100%;
    min-height: 0;
    flex: 1 1 auto;
    display: block;
    background: #e5e7eb;
    position: relative;
  }

  .map.hidden {
    display: none;
  }

  .resize-handle {
    background: transparent;
    cursor: col-resize;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.2s;
    user-select: none;
    -webkit-user-select: none;
    -moz-user-select: none;
    -ms-user-select: none;
    flex-shrink: 0;
    position: relative;
    z-index: 10000 !important;
    pointer-events: auto !important;
    touch-action: none;
  }

  .resize-handle::before {
    content: '';
    position: absolute;
    background: transparent;
    transition: background 0.2s;
    pointer-events: none;
  }

  .resize-handle:hover {
    background: rgba(100, 149, 237, 0.05);
  }

  .resize-handle:hover::before {
    background: rgba(100, 149, 237, 0.15);
  }

  .resize-handle.resizing {
    background: rgba(123, 104, 238, 0.1);
  }

  .resize-handle.resizing::before {
    background: rgba(123, 104, 238, 0.2);
  }

  .resize-handle-vertical {
    width: 20px;
    cursor: col-resize !important;
    z-index: 10000 !important;
    pointer-events: auto !important;
    margin: 0 -8px;
    background: transparent;
    position: relative;
    flex-shrink: 0;
    flex-grow: 0;
    align-self: stretch;
  }

  .resize-handle-vertical::before {
    width: 2px;
    height: 100%;
    left: 50%;
    transform: translateX(-50%);
    pointer-events: none;
    background: rgba(100, 149, 237, 0.08);
  }

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
  }
</style>
