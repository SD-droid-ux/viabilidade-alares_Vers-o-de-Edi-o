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
  let searchMode = 'nome'; // 'nome', 'endereco'
  
  // Campos de busca
  let nomeCTO = '';
  let enderecoInput = '';
  
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

  // Array para armazenar múltiplos marcadores de busca
  let searchMarkers = [];

  // Limpar marcadores do mapa
  function clearMap() {
    // Limpar marcadores das CTOs
    markers.forEach(marker => {
      if (marker && marker.setMap) {
        marker.setMap(null);
      }
    });
    markers = [];
    
    // Limpar marcadores de busca (múltiplos)
    searchMarkers.forEach(marker => {
      if (marker && marker.setMap) {
        marker.setMap(null);
      }
    });
    searchMarkers = [];
    
    // Limpar marcador único anterior (compatibilidade)
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

  // Função para calcular distância geodésica (Haversine)
  function calculateDistance(lat1, lng1, lat2, lng2) {
    const R = 6371000; // Raio da Terra em metros
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = 
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // Distância em metros
  }

  // Função para verificar se uma CTO já está na lista (evitar duplicatas)
  function isCTODuplicate(cto, existingList) {
    return existingList.some(existing => 
      existing.nome === cto.nome || 
      existing.id === cto.id ||
      (existing.latitude && existing.longitude && cto.latitude && cto.longitude &&
       Math.abs(parseFloat(existing.latitude) - parseFloat(cto.latitude)) < 0.0001 &&
       Math.abs(parseFloat(existing.longitude) - parseFloat(cto.longitude)) < 0.0001)
    );
  }

  // Função para buscar CTOs por nome (suporta múltiplas CTOs)
  async function searchByNome() {
    if (!nomeCTO.trim()) {
      error = 'Por favor, insira o nome da(s) CTO(s)';
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
      
      // Separar múltiplas CTOs (aceita vírgula, ponto e vírgula, ou quebra de linha)
      const ctoNames = nomeCTO
        .split(/[,;\n]/)
        .map(name => name.trim())
        .filter(name => name.length > 0);

      if (ctoNames.length === 0) {
        error = 'Por favor, insira pelo menos um nome de CTO';
        loadingCTOs = false;
        return;
      }

      console.log(`🔍 Buscando ${ctoNames.length} CTO(s):`, ctoNames);

      const allCTOsMap = new Map(); // CTOs próximas - chave: coordenadas (para evitar duplicatas entre próximas)
      const searchedCTOsList = []; // Lista de TODAS as CTOs pesquisadas pelo usuário (incluindo duplicatas por coordenadas)

      // ETAPA 1: Buscar TODAS as CTOs pesquisadas pelo usuário
      const searchPromises = ctoNames.map(async (ctoName) => {
        try {
          const searchResponse = await fetch(getApiUrl(`/api/ctos/search?nome=${encodeURIComponent(ctoName)}`));
          const searchData = await searchResponse.json();
          return { ctoName, searchData };
        } catch (err) {
          console.error(`Erro ao buscar CTO "${ctoName}":`, err);
          return { ctoName, searchData: null };
        }
      });

      const searchResults = await Promise.all(searchPromises);

      // Coletar TODAS as CTOs pesquisadas (incluindo duplicadas por coordenadas)
      let foundCount = 0;
      let notFoundCount = 0;
      let skippedCoordinatesCount = 0;
      
      for (const { ctoName, searchData } of searchResults) {
        if (!searchData?.success || !searchData.ctos || searchData.ctos.length === 0) {
          console.warn(`⚠️ CTO "${ctoName}" não encontrada na base de dados`);
          notFoundCount++;
          continue;
        }

        console.log(`✅ CTO "${ctoName}" encontrada: ${searchData.ctos.length} resultado(s)`);

        // Para cada CTO encontrada com esse nome - adicionar TODAS, mesmo com coordenadas duplicadas
        for (const foundCTO of searchData.ctos) {
          if (!foundCTO.latitude || !foundCTO.longitude) {
            console.warn(`⚠️ CTO "${foundCTO.nome}" sem coordenadas válidas (lat: ${foundCTO.latitude}, lng: ${foundCTO.longitude})`);
            skippedCoordinatesCount++;
            continue;
          }

          const lat = parseFloat(foundCTO.latitude);
          const lng = parseFloat(foundCTO.longitude);

          // Adicionar TODAS as CTOs pesquisadas à lista (sem verificar duplicatas)
          searchedCTOsList.push({ cto: foundCTO, lat, lng });
          foundCount++;
        }
      }
      
      console.log(`📊 Resumo da busca:`);
      console.log(`   - CTOs pesquisadas pelo usuário: ${ctoNames.length}`);
      console.log(`   - CTOs encontradas e adicionadas: ${foundCount}`);
      console.log(`   - CTOs não encontradas: ${notFoundCount}`);
      console.log(`   - CTOs ignoradas (sem coordenadas): ${skippedCoordinatesCount}`);

      if (searchedCTOsList.length === 0) {
        error = 'Nenhuma CTO encontrada. Verifique os nomes digitados.';
        loadingCTOs = false;
        return;
      }

      console.log(`✅ ${searchedCTOsList.length} CTO(s) pesquisada(s) encontrada(s)`);

      // Criar marcadores azuis para TODAS as CTOs pesquisadas
      if (map) {
        for (const { cto, lat, lng } of searchedCTOsList) {
          const marker = new google.maps.Marker({
            position: { lat, lng },
            map: map,
            title: `CTO pesquisada: ${cto.nome}`,
            icon: {
              url: 'https://maps.google.com/mapfiles/ms/icons/blue-dot.png',
              scaledSize: new google.maps.Size(32, 32)
            },
            zIndex: 999
          });
          searchMarkers.push(marker);
        }
      }

      // ETAPA 2: Para CADA CTO pesquisada, buscar todas as próximas dentro de 250m
      const nearbyPromises = searchedCTOsList.map(({ cto, lat, lng }) =>
        fetch(getApiUrl(`/api/ctos/nearby?lat=${lat}&lng=${lng}&radius=250`))
          .then(response => response.json())
          .then(nearbyData => ({ cto, nearbyData, lat, lng }))
          .catch(err => {
            console.error(`Erro ao buscar CTOs próximas de "${cto.nome}":`, err);
            return { cto, nearbyData: null, lat, lng };
          })
      );

      const nearbyResults = await Promise.all(nearbyPromises);

      // ETAPA 3: Processar resultados e adicionar CTOs próximas (evitando duplicatas com pesquisadas e entre si)
      // Criar Set de chaves das CTOs pesquisadas para evitar duplicatas
      const searchedKeysSetForNearby = new Set();
      searchedCTOsList.forEach(({ cto }) => {
        const key = `${parseFloat(cto.latitude).toFixed(6)},${parseFloat(cto.longitude).toFixed(6)}`;
        searchedKeysSetForNearby.add(key);
      });
      
      let totalNearbyFound = 0;
      let totalAddedToMap = 0;
      let totalSkippedDuplicates = 0;
      
      for (const { nearbyData, lat, lng, cto: searchedCto } of nearbyResults) {
        if (nearbyData?.success && nearbyData.ctos) {
          // Filtrar apenas CTOs dentro de 250m (garantir precisão)
          const nearbyCTOs = nearbyData.ctos.filter(cto => {
            if (!cto.latitude || !cto.longitude) return false;
            const distance = calculateDistance(lat, lng, parseFloat(cto.latitude), parseFloat(cto.longitude));
            return distance <= 250;
          });

          totalNearbyFound += nearbyCTOs.length;
          console.log(`📍 Para CTO "${searchedCto?.nome || 'N/A'}": ${nearbyCTOs.length} CTOs próximas encontradas na API`);

          // Adicionar CTOs próximas (evitando duplicatas com as pesquisadas e entre si)
          let addedThisRound = 0;
          let skippedThisRound = 0;
          for (const cto of nearbyCTOs) {
            const ctoNearbyKey = `${parseFloat(cto.latitude).toFixed(6)},${parseFloat(cto.longitude).toFixed(6)}`;
            // Não adicionar se já está nas pesquisadas ou já foi adicionada como próxima
            if (!searchedKeysSetForNearby.has(ctoNearbyKey) && !allCTOsMap.has(ctoNearbyKey)) {
              allCTOsMap.set(ctoNearbyKey, cto);
              totalAddedToMap++;
              addedThisRound++;
            } else {
              skippedThisRound++;
              totalSkippedDuplicates++;
            }
          }
          console.log(`   → Adicionadas: ${addedThisRound}, Ignoradas (duplicatas): ${skippedThisRound}`);
        } else {
          console.warn(`⚠️ Erro ao buscar CTOs próximas para "${searchedCto?.nome || 'N/A'}":`, nearbyData);
        }
      }
      
      console.log(`📊 Resumo da consolidação:`);
      console.log(`   - Total de CTOs próximas encontradas (com duplicatas): ${totalNearbyFound}`);
      console.log(`   - CTOs únicas adicionadas ao Map: ${totalAddedToMap}`);
      console.log(`   - CTOs ignoradas (duplicatas): ${totalSkippedDuplicates}`);
      console.log(`   - Tamanho do Map (apenas próximas): ${allCTOsMap.size}`);

      // ETAPA 4: Organizar resultado final - TODAS as CTOs pesquisadas primeiro, depois próximas
      // Criar Set de chaves das CTOs pesquisadas para evitar duplicatas nas próximas
      const searchedKeysSet = new Set();
      searchedCTOsList.forEach(({ cto }) => {
        const key = `${parseFloat(cto.latitude).toFixed(6)},${parseFloat(cto.longitude).toFixed(6)}`;
        searchedKeysSet.add(key);
      });

      // Separar CTOs pesquisadas (TODAS, incluindo com coordenadas duplicadas) e próximas
      const searchedCTOs = searchedCTOsList.map(({ cto }) => cto); // TODAS as pesquisadas, na ordem que foram pesquisadas
      const nearbyCTOs = [];
      
      // Processar todas as CTOs próximas do Map (já filtradas para evitar duplicatas com pesquisadas)
      for (const cto of allCTOsMap.values()) {
        nearbyCTOs.push(cto);
      }

      // Resultado final: TODAS as CTOs pesquisadas primeiro (na ordem pesquisada), depois próximas
      // IMPORTANTE: Todas as CTOs pesquisadas aparecem, mesmo com coordenadas duplicadas
      ctos = [...searchedCTOs, ...nearbyCTOs];

      console.log(`✅ Total final: ${searchedCTOs.length} CTO(s) pesquisada(s) + ${nearbyCTOs.length} CTO(s) próxima(s) = ${ctos.length} CTO(s) no total`);
      console.log(`📋 CTOs pesquisadas na lista: ${searchedCTOsList.length}, CTOs pesquisadas no resultado: ${searchedCTOs.length}, CTOs próximas: ${nearbyCTOs.length}`);
      console.log(`📝 Nomes das CTOs pesquisadas:`, searchedCTOs.map(cto => cto.nome).join(', '));
      console.log(`🔍 Verificação: Array ctos tem ${ctos.length} elementos`);
      
      // Verificar se há duplicatas
      const uniqueKeys = new Set();
      let duplicates = 0;
      for (const cto of ctos) {
        const key = `${parseFloat(cto.latitude).toFixed(6)},${parseFloat(cto.longitude).toFixed(6)}`;
        if (uniqueKeys.has(key)) {
          duplicates++;
        } else {
          uniqueKeys.add(key);
        }
      }
      if (duplicates > 0) {
        console.warn(`⚠️ Encontradas ${duplicates} CTOs duplicadas no resultado final`);
      }

      if (ctos.length === 0) {
        error = 'Nenhuma CTO encontrada. Verifique os nomes digitados.';
        loadingCTOs = false;
        return;
      }

      // Os marcadores já foram criados e adicionados ao array searchMarkers
      // Limpar marcador único anterior se existir (compatibilidade)
      if (searchMarker) {
        searchMarker.setMap(null);
        searchMarker = null;
      }
      
      // Aguardar um pouco para garantir que o DOM está atualizado
      await tick();
      await displayResultsOnMap();
    } catch (err) {
      console.error('Erro ao buscar CTOs:', err);
      error = 'Erro ao buscar CTOs. Tente novamente.';
    } finally {
      loadingCTOs = false;
    }
  }

  // Função para detectar se o input é coordenadas (lat, lng) ou endereço
  function parseCoordinatesOrAddress(input) {
    const trimmed = input.trim();
    
    // Tentar detectar formato de coordenadas: "lat, lng" ou "lat,lng"
    const coordPattern = /^-?\d+\.?\d*\s*,\s*-?\d+\.?\d*$/;
    
    if (coordPattern.test(trimmed)) {
      const parts = trimmed.split(',').map(p => p.trim());
      const lat = parseFloat(parts[0]);
      const lng = parseFloat(parts[1]);
      
      // Validar se são coordenadas válidas
      if (!isNaN(lat) && !isNaN(lng) && 
          lat >= -90 && lat <= 90 && 
          lng >= -180 && lng <= 180) {
        return { isCoordinates: true, lat, lng };
      }
    }
    
    // Se não for coordenadas, tratar como endereço
    return { isCoordinates: false, address: trimmed };
  }

  // Função para buscar CTOs por endereço ou coordenadas
  async function searchByEndereco() {
    if (!enderecoInput.trim()) {
      error = 'Por favor, insira um endereço ou coordenadas (lat, lng)';
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

      let lat, lng;
      const parsed = parseCoordinatesOrAddress(enderecoInput);

      if (parsed.isCoordinates) {
        // É coordenadas - usar diretamente
        lat = parsed.lat;
        lng = parsed.lng;
      } else {
        // É endereço - verificar se o Google Maps está carregado
        if (!googleMapsLoaded || !google.maps || !google.maps.Geocoder) {
          error = 'Google Maps não está carregado. Aguarde alguns instantes e tente novamente.';
          loadingCTOs = false;
          return;
        }
        
        // Geocodificar endereço
        const result = await geocodeAddress(parsed.address);
        const location = result.geometry.location;
        lat = location.lat();
        lng = location.lng();
      }

      // Buscar todas as CTOs próximas dentro de 250m
      const response = await fetch(getApiUrl(`/api/ctos/nearby?lat=${lat}&lng=${lng}&radius=250`));
      const data = await response.json();

      if (data.success && data.ctos) {
        // Filtrar apenas CTOs dentro de 250m (garantir precisão) - SEM LIMITE
        const allNearbyCTOs = data.ctos.filter(cto => {
          if (!cto.latitude || !cto.longitude) return false;
          const distance = calculateDistance(lat, lng, parseFloat(cto.latitude), parseFloat(cto.longitude));
          return distance <= 250;
        });
        
        console.log(`📍 Busca por endereço: ${allNearbyCTOs.length} CTOs encontradas dentro de 250m (sem limite)`);
        ctos = allNearbyCTOs; // Todas as CTOs, sem limite
        
        // Limpar marcador anterior se existir
        if (searchMarker) {
          searchMarker.setMap(null);
        }
        
        // Adicionar marcador do ponto pesquisado (azul)
        if (map) {
          const markerTitle = parsed.isCoordinates 
            ? `Coordenadas pesquisadas: ${lat}, ${lng}` 
            : 'Endereço pesquisado';
          
          searchMarker = new google.maps.Marker({
            position: { lat, lng },
            map: map,
            title: markerTitle,
            icon: {
              url: 'https://maps.google.com/mapfiles/ms/icons/blue-dot.png',
              scaledSize: new google.maps.Size(32, 32)
            },
            zIndex: 999
          });
        }
        
        // Aguardar um pouco para garantir que o DOM está atualizado
        await tick();
        // Exibir CTOs no mapa (isso vai ajustar o zoom automaticamente)
        await displayResultsOnMap();
        
        // Se não houver CTOs, centralizar no ponto pesquisado
        if (ctos.length === 0 && map) {
          map.setCenter({ lat, lng });
          map.setZoom(15);
        }
      } else {
        error = data.error || 'Erro ao buscar CTOs';
      }
    } catch (err) {
      console.error('Erro ao buscar por endereço/coordenadas:', err);
      error = err.message || 'Erro ao processar endereço ou coordenadas. Verifique se os dados estão corretos.';
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
    
    console.log(`🗺️ Exibindo ${ctos.length} CTOs no mapa (sem limite)`);

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
    let markersCreated = 0;
    let markersSkipped = 0;

    // ETAPA 1: Agrupar CTOs por coordenadas (lat/lng idênticas)
    const ctosByPosition = new Map(); // Chave: "lat,lng", Valor: Array de CTOs + números
    const ctoToNumber = new Map(); // Mapear CTO para seu número no array
    
    for (let i = 0; i < ctos.length; i++) {
      const cto = ctos[i];
      
      // Validar coordenadas
      if (!cto.latitude || !cto.longitude || isNaN(cto.latitude) || isNaN(cto.longitude)) {
        console.warn(`⚠️ CTO ${cto.nome} tem coordenadas inválidas:`, cto.latitude, cto.longitude);
        markersSkipped++;
        continue;
      }
      
      const lat = parseFloat(cto.latitude).toFixed(6);
      const lng = parseFloat(cto.longitude).toFixed(6);
      const positionKey = `${lat},${lng}`;
      
      // Agrupar CTOs por posição
      if (!ctosByPosition.has(positionKey)) {
        ctosByPosition.set(positionKey, { position: { lat: parseFloat(lat), lng: parseFloat(lng) }, ctos: [], numbers: [] });
      }
      
      const group = ctosByPosition.get(positionKey);
      group.ctos.push(cto);
      group.numbers.push(markerNumber);
      ctoToNumber.set(cto, markerNumber);
      markerNumber++;
    }
    
    console.log(`📊 Agrupamento: ${ctosByPosition.size} posições únicas, ${ctos.length - markersSkipped} CTOs totais`);

    // ETAPA 2: Criar marcadores (um por grupo de coordenadas)
    for (const [positionKey, group] of ctosByPosition) {
      const { position, ctos: groupCTOs, numbers } = group;
      
      bounds.extend(position);
      
      // Determinar cor baseada na primeira CTO do grupo (ou média, pode ajustar depois)
      const firstCTO = groupCTOs[0];
      const ctoColor = getCTOColor(firstCTO.pct_ocup || 0);
      
      // Criar label com todos os números (ex: "1/9" ou "1/9/15")
      const labelText = numbers.join('/');

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
        // Criar marcador único para este grupo
        const marker = new google.maps.Marker({
          position: position,
          map: map,
          title: `${groupCTOs.length} CTO(s) neste ponto: ${groupCTOs.map(cto => cto.nome).join(', ')}`,
          icon: iconConfig,
          label: {
            text: labelText,
            color: '#FFFFFF',
            fontSize: '14px',
            fontWeight: 'bold'
          },
          zIndex: 1000 + numbers[0],
          optimized: false
        });
        
        console.log(`Marcador ${labelText} criado para ${groupCTOs.length} CTO(s) em`, position);

        // InfoWindow com informações de TODAS as CTOs do grupo
        let infoWindowContent = '<div style="padding: 8px; font-family: \'Inter\', sans-serif; line-height: 1.6; max-width: 400px;">';
        
        for (let i = 0; i < groupCTOs.length; i++) {
          const cto = groupCTOs[i];
          const pctOcup = parseFloat(cto.pct_ocup) || 0;
          const statusCto = cto.status_cto || '';
          const isAtiva = statusCto && statusCto.toUpperCase().trim() === 'ATIVADO';
          
          // Separador entre múltiplas CTOs
          if (i > 0) {
            infoWindowContent += '<hr style="margin: 16px 0; border: none; border-top: 2px solid #e5e7eb;">';
          }
          
          // Alerta se não está ativa
          if (!isAtiva) {
            infoWindowContent += `
              <div style="background-color: #DC3545; color: white; padding: 12px; margin-bottom: 12px; border-radius: 4px; font-weight: bold; text-align: center;">
                ⚠️ CTO NÃO ATIVA
              </div>
            `;
          }
          
          // Informações da CTO
          infoWindowContent += `
            <div style="margin-bottom: ${i < groupCTOs.length - 1 ? '16px' : '0'};">
              <h4 style="margin: 0 0 8px 0; color: #1e40af; font-size: 16px;">CTO #${numbers[i]}: ${String(cto.nome || 'N/A')}</h4>
              <strong>Cidade:</strong> ${String(cto.cidade || 'N/A')}<br>
              <strong>POP:</strong> ${String(cto.pop || 'N/A')}<br>
              <strong>ID:</strong> ${String(cto.id || 'N/A')}<br>
              <strong>Status:</strong> <span style="color: ${isAtiva ? '#28A745' : '#DC3545'}; font-weight: bold;">${String(statusCto || 'N/A')}</span><br>
              <strong>Total de Portas:</strong> ${Number(cto.vagas_total || 0)}<br>
              <strong>Portas Conectadas:</strong> ${Number(cto.clientes_conectados || 0)}<br>
              <strong>Portas Disponíveis:</strong> ${Number((cto.vagas_total || 0) - (cto.clientes_conectados || 0))}<br>
              <strong>Ocupação:</strong> ${pctOcup.toFixed(1)}%
            </div>
          `;
        }
        
        infoWindowContent += '</div>';

        const infoWindow = new google.maps.InfoWindow({
          content: infoWindowContent
        });

        marker.addListener('click', () => {
          infoWindow.open(map, marker);
        });

        markers.push(marker);
        markersCreated++;
      } catch (markerErr) {
        console.error(`❌ Erro ao criar marcador para posição ${positionKey}:`, markerErr);
        markersSkipped++;
      }
    }
    
    console.log(`📊 Resumo: ${markersCreated} marcadores criados, ${markersSkipped} ignorados de ${ctos.length} CTOs totais`);

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
    console.log('🖱️ Iniciando redimensionamento da sidebar');
    e.preventDefault();
    e.stopPropagation();
    isResizingSidebar = true;
    resizeStartX = e.clientX;
    resizeStartSidebarWidth = sidebarWidth;
    document.addEventListener('mousemove', handleResizeSidebar, { passive: false });
    document.addEventListener('mouseup', stopResizeSidebar, { passive: false });
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }

  function handleResizeSidebar(e) {
    if (!isResizingSidebar) return;
    e.preventDefault();
    e.stopPropagation();
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
    console.log('✅ Parando redimensionamento da sidebar');
    isResizingSidebar = false;
    document.removeEventListener('mousemove', handleResizeSidebar);
    document.removeEventListener('mouseup', stopResizeSidebar);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }

  function startResizeMapTable(e) {
    console.log('🖱️ Iniciando redimensionamento mapa/tabela');
    e.preventDefault();
    e.stopPropagation();
    isResizingMapTable = true;
    resizeStartY = e.clientY;
    resizeStartMapHeight = mapHeightPercent;
    document.addEventListener('mousemove', handleResizeMapTable, { passive: false });
    document.addEventListener('mouseup', stopResizeMapTable, { passive: false });
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
  }

  function handleResizeMapTable(e) {
    if (!isResizingMapTable) return;
    e.preventDefault();
    e.stopPropagation();
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
    console.log('✅ Parando redimensionamento mapa/tabela');
    isResizingMapTable = false;
    document.removeEventListener('mousemove', handleResizeMapTable);
    document.removeEventListener('mouseup', stopResizeMapTable);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    
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
        </div>

        <div class="search-form">
          {#if searchMode === 'nome'}
            <div class="form-group">
              <label for="nome-cto">Nome da(s) CTO(s)</label>
              <textarea 
                id="nome-cto"
                bind:value={nomeCTO}
                placeholder="Ex: CTO123 ou múltiplas: CTO123, CTO456, CTO789"
                rows="3"
                on:keydown={(e) => e.key === 'Enter' && !e.shiftKey && handleSearch()}
              ></textarea>
              <small style="color: #666; font-size: 0.75rem; margin-top: 0.25rem; display: block;">
                Digite uma ou múltiplas CTOs separadas por vírgula, ponto e vírgula ou quebra de linha
              </small>
            </div>
          {:else if searchMode === 'endereco'}
            <div class="form-group">
              <label for="endereco">Endereço ou Coordenadas</label>
              <input 
                id="endereco"
                type="text" 
                bind:value={enderecoInput}
                placeholder="Ex: Rua Exemplo, 123 ou -23.5505, -46.6333"
                on:keydown={(e) => e.key === 'Enter' && handleSearch()}
              />
              <small style="color: #666; font-size: 0.75rem; margin-top: 0.25rem; display: block;">
                Digite um endereço ou coordenadas no formato: lat, lng
              </small>
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
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    overflow-y: auto;
    overflow-x: hidden;
    background: #f5f7fa;
  }

  .main-layout {
    display: flex;
    flex: 1;
    min-height: calc(100vh - 60px); /* Altura mínima considerando o header */
    gap: 0; /* Remover gap para permitir que o handle fique exatamente entre os elementos */
    padding: 1rem;
    padding-bottom: 2rem; /* Espaço extra no final para permitir rolar até a borda */
    overflow: visible;
    align-items: flex-start; /* Alinhar no topo para permitir crescimento */
    position: relative;
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

  .form-group input,
  .form-group textarea {
    padding: 0.75rem;
    border: 2px solid #e5e7eb;
    border-radius: 8px;
    font-size: 0.9375rem;
    transition: border-color 0.2s;
    font-family: inherit;
    width: 100%;
    box-sizing: border-box;
  }

  .form-group textarea {
    resize: vertical;
    min-height: 80px;
    line-height: 1.5;
  }

  .form-group input:focus,
  .form-group textarea:focus {
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
    gap: 0; /* Remover gap para permitir que o handle fique exatamente entre os elementos */
    overflow: visible;
    min-height: 0;
    width: 100%;
    position: relative;
  }

  /* Garantir que a tabela possa crescer e rolar corretamente */
  .main-area > .results-table-container {
    flex: 0 1 auto; /* Não forçar crescimento, permitir tamanho natural */
    min-height: 0;
    display: flex;
    flex-direction: column;
    align-self: stretch; /* Esticar na largura mas permitir altura natural */
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
    overflow: hidden;
    flex: 0 1 auto; /* Não crescer além do necessário, mas permitir scroll */
    width: 100%;
    max-width: 100%;
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
    -webkit-user-select: none;
    -moz-user-select: none;
    -ms-user-select: none;
    flex-shrink: 0;
    position: relative;
    z-index: 1000;
    pointer-events: auto !important;
    touch-action: none;
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
    width: 8px; /* Aumentar área clicável */
    cursor: col-resize;
    z-index: 1000; /* Aumentar z-index para ficar acima de tudo */
    pointer-events: auto;
    margin: 0 -2px; /* Expandir área de hover sem mudar layout */
  }

  .resize-handle-vertical::before {
    width: 2px;
    height: 100%;
    left: 50%;
    transform: translateX(-50%);
  }

  .resize-handle-horizontal {
    height: 8px; /* Aumentar área clicável */
    cursor: row-resize;
    width: 100%;
    z-index: 1000; /* Aumentar z-index para ficar acima de tudo */
    pointer-events: auto;
    position: relative;
    margin: -2px 0; /* Expandir área de hover sem mudar layout */
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
    flex: 1 1 auto;
    min-height: 0;
    position: relative;
    -webkit-overflow-scrolling: touch;
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
    table-layout: auto;
  }
  
  /* Garantir que o tbody não tenha restrições de altura */
  .results-table tbody {
    display: table-row-group;
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
