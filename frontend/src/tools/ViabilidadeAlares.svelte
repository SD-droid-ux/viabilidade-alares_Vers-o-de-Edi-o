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
  let loadingCTOs = false;
  let loadingDots = '.';
  let loadingDotsInterval = null;
  
  // Google Maps
  let map;
  let mapElement;
  let googleMapsLoaded = false;
  let mapInitialized = false;
  const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';
  let markers = [];
  let searchMarkers = [];
  let routes = [];
  let directionsService;
  let directionsRenderer;
  
  // Estados para mancha de cobertura
  let coveragePolygons = []; // Array para armazenar polígonos de cobertura
  let coverageData = null; // Dados do polígono de cobertura (metadados)
  let coveragePolygonGeoJSON = null; // GeoJSON do polígono de cobertura
  let coverageOpacity = 0.4; // Opacidade das manchas (0-1)
  
  // Campos de busca
  let enderecoInput = '';
  let viAla = '';
  let ala = '';
  let projetista = '';
  let cidade = '';
  
  // Resultados
  let ctos = [];
  let error = null;
  let selectedAddress = null; // {lat, lng, address}
  
  // Estados para rotas
  let calculatedRoutes = []; // Array de {cto, route, distance}
  let isCalculatingRoutes = false;
  
  // Estados para VI ALA
  let nextVIALA = '';
  let viAlaList = [];
  let loadingVIALA = false;
  
  // Estados para layout e tabela
  let sidebarWidth = 400;
  let mapHeightPixels = 400;
  let isResizingSidebar = false;
  let isResizingMapTable = false;
  let resizeStartX = 0;
  let resizeStartY = 0;
  let resizeStartSidebarWidth = 0;
  let resizeStartMapHeight = 0;
  let isSearchPanelMinimized = false;
  let isMapMinimized = false;
  let isTableMinimized = true; // Começar minimizada quando não há resultados
  
  // Reactive statements para calcular estilos
  $: sidebarWidthStyle = `${sidebarWidth}px`;
  $: mapHeightStyle = `${mapHeightPixels}px`;
  
  // Função para calcular números das CTOs (para exibição na tabela e mapa)
  $: ctoNumbers = new Map(ctos.map((cto, index) => [cto, index + 1]));
  
  // Função para gerar chave única de CTO
  function getCTOKey(cto) {
    const id = cto.id_cto || cto.id || 'NO_ID';
    const lat = parseFloat(cto.latitude || 0).toFixed(6);
    const lng = parseFloat(cto.longitude || 0).toFixed(6);
    return `${id}_${cto.nome || 'UNKNOWN'}_${lat}_${lng}`;
  }
  
  // Função para calcular distância geodésica (Haversine)
  function calculateDistance(lat1, lng1, lat2, lng2) {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = 
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
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
        { address: address.trim(), region: 'br' },
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
  
  // Função para inicializar Google Maps
  async function initGoogleMaps() {
    if (googleMapsLoaded) return;
    
    try {
      const loader = new Loader({
        apiKey: GOOGLE_MAPS_API_KEY,
        version: 'weekly',
        libraries: ['places', 'geometry', 'marker', 'routes']
      });
      
      await loader.load();
      googleMapsLoaded = true;
      console.log('✅ Google Maps carregado');
    } catch (err) {
      console.error('❌ Erro ao carregar Google Maps:', err);
      error = 'Erro ao carregar Google Maps. Verifique a chave da API.';
    }
  }
  
  // Função para inicializar mapa
  function initMap() {
    if (!mapElement || !googleMapsLoaded || mapInitialized) return;
    
    try {
      map = new google.maps.Map(mapElement, {
        center: { lat: -3.7172, lng: -38.5433 }, // Fortaleza
        zoom: 12,
        mapTypeId: 'roadmap'
      });
      
      directionsService = new google.maps.DirectionsService();
      directionsRenderer = new google.maps.DirectionsRenderer({
        map: map,
        suppressMarkers: true
      });
      
      mapInitialized = true;
      console.log('✅ Mapa inicializado');
    } catch (err) {
      console.error('❌ Erro ao inicializar mapa:', err);
      error = 'Erro ao inicializar mapa.';
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
    calculatedRoutes = [];
    clearMap();
    
    try {
      if (!map) {
        await initGoogleMaps();
        await tick();
        initMap();
        await tick();
        await new Promise(resolve => setTimeout(resolve, 200));
      }
      
      // Geocodificar endereço
      const geocodeResult = await geocodeAddress(enderecoInput);
      const location = geocodeResult.geometry.location;
      const lat = location.lat();
      const lng = location.lng();
      
      selectedAddress = {
        lat,
        lng,
        address: enderecoInput
      };
      
      // Criar marcador do endereço
      if (map) {
        const pinElement = new google.maps.marker.PinElement({
          background: '#4285F4',
          borderColor: '#FFFFFF',
          glyphColor: '#FFFFFF',
          scale: 1.2
        });
        
        const marker = new google.maps.marker.AdvancedMarkerElement({
          map: map,
          position: { lat, lng },
          title: `Endereço: ${enderecoInput}`,
          content: pinElement.element,
          zIndex: 999
        });
        searchMarkers.push(marker);
        
        // Centralizar no endereço
        map.setCenter({ lat, lng });
        map.setZoom(15);
      }
      
      // Buscar CTOs próximas (raio progressivo: 250m, 500m, 700m)
      const searchRadii = [250, 500, 700];
      let nearbyData = null;
      let usedRadius = 250;
      
      for (const radius of searchRadii) {
        try {
          const response = await fetch(getApiUrl(`/api/ctos/nearby?lat=${lat}&lng=${lng}&radius=${radius}`));
          if (!response.ok) continue;
          
          const data = await response.json();
          if (data?.success && data.ctos && data.ctos.length > 0) {
            nearbyData = data;
            usedRadius = radius;
            break;
          }
        } catch (err) {
          console.error(`Erro ao buscar CTOs com raio ${radius}m:`, err);
        }
      }
      
      if (!nearbyData || !nearbyData.ctos || nearbyData.ctos.length === 0) {
        error = `Nenhuma CTO encontrada dentro de ${usedRadius}m do endereço.`;
        loadingCTOs = false;
        return;
      }
      
      // Filtrar CTOs dentro do raio usado
      ctos = nearbyData.ctos.filter(cto => {
        if (!cto.latitude || !cto.longitude) return false;
        const distance = calculateDistance(lat, lng, parseFloat(cto.latitude), parseFloat(cto.longitude));
        return distance <= usedRadius;
      });
      
      console.log(`✅ ${ctos.length} CTO(s) encontrada(s) no raio de ${usedRadius}m`);
      
      // Expandir tabela quando houver resultados
      isTableMinimized = false;
      
      // Exibir CTOs no mapa
      await displayCTOsOnMap();
      
      // Calcular rotas
      await calculateRoutes();
      
    } catch (err) {
      console.error('Erro ao buscar por endereço:', err);
      error = err.message || 'Erro ao processar endereço.';
    } finally {
      loadingCTOs = false;
    }
  }
  
  // Função para exibir CTOs no mapa
  async function displayCTOsOnMap() {
    if (!map || !google.maps || ctos.length === 0) return;
    
    // Limpar marcadores anteriores
    markers.forEach(marker => {
      if (marker && marker.setMap) marker.setMap(null);
    });
    markers = [];
    
    const bounds = new google.maps.LatLngBounds();
    
    // Criar marcadores para cada CTO
    ctos.forEach((cto, index) => {
      if (!cto.latitude || !cto.longitude) return;
      
      const lat = parseFloat(cto.latitude);
      const lng = parseFloat(cto.longitude);
      
      bounds.extend({ lat, lng });
      
      // Criar marcador com número
      const markerElement = document.createElement('div');
      markerElement.style.width = '36px';
      markerElement.style.height = '36px';
      markerElement.style.borderRadius = '50%';
      markerElement.style.backgroundColor = '#7B68EE';
      markerElement.style.border = '3px solid #000000';
      markerElement.style.display = 'flex';
      markerElement.style.alignItems = 'center';
      markerElement.style.justifyContent = 'center';
      markerElement.style.color = '#FFFFFF';
      markerElement.style.fontSize = '14px';
      markerElement.style.fontWeight = 'bold';
      markerElement.style.fontFamily = 'Arial, sans-serif';
      markerElement.style.boxShadow = '0 2px 4px rgba(0,0,0,0.3)';
      markerElement.style.cursor = 'pointer';
      markerElement.textContent = (index + 1).toString();
      
      const marker = new google.maps.marker.AdvancedMarkerElement({
        map: map,
        position: { lat, lng },
        title: `CTO ${index + 1}: ${cto.nome || 'N/A'}`,
        content: markerElement,
        zIndex: 1000 + index
      });
      
      // InfoWindow
      const infoWindow = new google.maps.InfoWindow({
        content: `
          <div style="padding: 8px; font-family: 'Inter', sans-serif;">
            <h4 style="margin: 0 0 8px 0; color: #1e40af;">CTO #${index + 1}: ${cto.nome || 'N/A'}</h4>
            <strong>Cidade:</strong> ${cto.cidade || 'N/A'}<br>
            <strong>POP:</strong> ${cto.pop || 'N/A'}<br>
            <strong>Status:</strong> ${cto.status_cto || 'N/A'}<br>
            <strong>Total de Portas:</strong> ${cto.vagas_total || 0}<br>
            <strong>Portas Disponíveis:</strong> ${(cto.vagas_total || 0) - (cto.clientes_conectados || 0)}<br>
          </div>
        `
      });
      
      markerElement.addEventListener('click', () => {
        infoWindow.open({ anchor: marker, map: map });
      });
      
      markers.push(marker);
    });
    
    // Ajustar zoom
    if (markers.length > 0) {
      if (markers.length === 1) {
        map.setCenter({ lat: parseFloat(ctos[0].latitude), lng: parseFloat(ctos[0].longitude) });
        map.setZoom(16);
      } else {
        map.fitBounds(bounds, { top: 50, right: 50, bottom: 50, left: 50 });
      }
    }
  }
  
  // Função para calcular rotas
  async function calculateRoutes() {
    if (!map || !selectedAddress || ctos.length === 0 || !directionsService) return;
    
    isCalculatingRoutes = true;
    calculatedRoutes = [];
    
    try {
      const routePromises = ctos.map(async (cto, index) => {
        if (!cto.latitude || !cto.longitude) return null;
        
        try {
          const request = {
            origin: { lat: selectedAddress.lat, lng: selectedAddress.lng },
            destination: { lat: parseFloat(cto.latitude), lng: parseFloat(cto.longitude) },
            travelMode: google.maps.TravelMode.WALKING
          };
          
          return new Promise((resolve) => {
            directionsService.route(request, (result, status) => {
              if (status === 'OK' && result) {
                const route = result.routes[0];
                const distance = route.legs[0].distance.value; // em metros
                resolve({ cto, route, distance, index });
              } else {
                console.warn(`Erro ao calcular rota para CTO ${cto.nome}:`, status);
                resolve(null);
              }
            });
          });
        } catch (err) {
          console.error(`Erro ao calcular rota para CTO ${cto.nome}:`, err);
          return null;
        }
      });
      
      const routes = await Promise.all(routePromises);
      calculatedRoutes = routes.filter(r => r !== null);
      
      // Ordenar por distância
      calculatedRoutes.sort((a, b) => a.distance - b.distance);
      
      // Desenhar rotas no mapa
      await drawRoutesOnMap();
      
      console.log(`✅ ${calculatedRoutes.length} rota(s) calculada(s)`);
    } catch (err) {
      console.error('Erro ao calcular rotas:', err);
    } finally {
      isCalculatingRoutes = false;
    }
  }
  
  // Função para desenhar rotas no mapa
  async function drawRoutesOnMap() {
    if (!map || !directionsRenderer || calculatedRoutes.length === 0) return;
    
    // Limpar rotas anteriores
    routes.forEach(route => {
      if (route && route.setMap) route.setMap(null);
    });
    routes = [];
    
    // Desenhar apenas a rota da CTO mais próxima
    if (calculatedRoutes.length > 0) {
      const closestRoute = calculatedRoutes[0];
      
      directionsRenderer.setDirections({
        routes: [closestRoute.route],
        request: {
          origin: { lat: selectedAddress.lat, lng: selectedAddress.lng },
          destination: { lat: parseFloat(closestRoute.cto.latitude), lng: parseFloat(closestRoute.cto.longitude) },
          travelMode: google.maps.TravelMode.WALKING
        }
      });
      
      routes.push(directionsRenderer);
    }
  }
  
  // Funções de redimensionamento
  function startResizeSidebar(e) {
    e.preventDefault();
    e.stopPropagation();
    isResizingSidebar = true;
    resizeStartX = e.clientX || (e.touches && e.touches[0].clientX);
    resizeStartSidebarWidth = sidebarWidth;
    
    const handleMove = (moveEvent) => {
      const currentX = moveEvent.clientX || (moveEvent.touches && moveEvent.touches[0].clientX);
      const deltaX = currentX - resizeStartX;
      const newWidth = resizeStartSidebarWidth + deltaX;
      
      if (newWidth >= 250 && newWidth <= 700) {
        sidebarWidth = newWidth;
      }
    };
    
    const handleEnd = () => {
      isResizingSidebar = false;
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleEnd);
      document.removeEventListener('touchmove', handleMove);
      document.removeEventListener('touchend', handleEnd);
    };
    
    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleEnd);
    document.addEventListener('touchmove', handleMove);
    document.addEventListener('touchend', handleEnd);
  }
  
  function startResizeMapTable(e) {
    e.preventDefault();
    e.stopPropagation();
    isResizingMapTable = true;
    resizeStartY = e.clientY || (e.touches && e.touches[0].clientY);
    resizeStartMapHeight = mapHeightPixels;
    
    const handleMove = (moveEvent) => {
      const currentY = moveEvent.clientY || (moveEvent.touches && moveEvent.touches[0].clientY);
      const deltaY = currentY - resizeStartY;
      const newHeight = resizeStartMapHeight + deltaY;
      
      if (newHeight >= 300 && newHeight <= 1000) {
        mapHeightPixels = newHeight;
      }
    };
    
    const handleEnd = () => {
      isResizingMapTable = false;
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleEnd);
      document.removeEventListener('touchmove', handleMove);
      document.removeEventListener('touchend', handleEnd);
    };
    
    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleEnd);
    document.addEventListener('touchmove', handleMove);
    document.addEventListener('touchend', handleEnd);
  }
  
  // Função para formatar data de criação
  function formatDataCriacao(cto) {
    const dataCriacao = cto.data_criacao || cto.data_cadastro || cto.created_at || '';
    if (!dataCriacao) return 'N/A';
    
    try {
      const date = new Date(dataCriacao);
      if (isNaN(date.getTime())) return dataCriacao;
      
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const year = date.getFullYear();
      return `${month}/${year}`;
    } catch {
      return dataCriacao;
    }
  }
  
  // Função para carregar polígono de cobertura do backend
  async function loadCoveragePolygon() {
    try {
      loadingMessage = 'Carregando polígonos de cobertura...';
      console.log('📥 Carregando polígono de cobertura do backend...');
      
      const response = await fetch(getApiUrl('/api/coverage/polygon?simplified=true'));
      
      if (!response.ok) {
        console.warn('⚠️ Não foi possível carregar polígonos de cobertura:', response.status);
        return false;
      }
      
      const data = await response.json();
      
      if (!data.success) {
        console.warn('⚠️ Nenhum polígono de cobertura encontrado. Execute o cálculo primeiro.');
        return false;
      }
      
      coverageData = data;
      coveragePolygonGeoJSON = data.geometry;
      
      console.log(`✅ Polígono de cobertura carregado: ${data.total_ctos} CTOs, ${data.area_km2?.toFixed(2)} km²`);
      
      return true;
    } catch (err) {
      console.warn('⚠️ Erro ao carregar polígono de cobertura:', err);
      return false;
    }
  }

  // Função para desenhar polígono de cobertura no mapa
  async function drawCoverageArea() {
    if (!map || !google.maps) {
      console.warn('⚠️ Mapa não disponível para desenhar polígono');
      return;
    }
    
    if (!coveragePolygonGeoJSON) {
      console.warn('⚠️ Nenhum polígono de cobertura carregado');
      return;
    }

    // Verificar se o mapa tem dimensões válidas
    if (mapElement) {
      const mapRect = mapElement.getBoundingClientRect();
      if (mapRect.width === 0 || mapRect.height === 0) {
        console.warn('⚠️ Mapa não tem dimensões válidas, aguardando...');
        await new Promise(resolve => setTimeout(resolve, 500));
        google.maps.event.trigger(map, 'resize');
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    }

    console.log(`🗺️ Desenhando polígono de cobertura (${coverageData?.total_ctos || 0} CTOs)...`);

    // Aguardar um pouco para garantir que o mapa está totalmente renderizado
    await new Promise(resolve => setTimeout(resolve, 200));

    const bounds = new google.maps.LatLngBounds();

    // Limpar polígonos anteriores
    coveragePolygons.forEach(polygon => {
      if (polygon && polygon.setMap) {
        polygon.setMap(null);
      }
    });
    coveragePolygons = [];

    // Converter GeoJSON para formato do Google Maps
    try {
      let polygonsToRender = [];
      
      if (coveragePolygonGeoJSON.type === 'Polygon') {
        polygonsToRender = [coveragePolygonGeoJSON];
      } else if (coveragePolygonGeoJSON.type === 'MultiPolygon') {
        polygonsToRender = coveragePolygonGeoJSON.coordinates.map(coords => ({
          type: 'Polygon',
          coordinates: coords
        }));
      } else {
        console.error('❌ Formato GeoJSON não suportado:', coveragePolygonGeoJSON.type);
        return;
      }
      
      console.log(`🎨 Renderizando ${polygonsToRender.length} polígono(s) de cobertura...`);
      
      // Renderizar cada polígono
      for (const geoJsonPolygon of polygonsToRender) {
        const paths = geoJsonPolygon.coordinates[0].map(coord => ({
          lat: coord[1], // GeoJSON usa [lng, lat], Google Maps usa {lat, lng}
          lng: coord[0]
        }));
        
        const polygon = new google.maps.Polygon({
          paths: paths,
          strokeColor: '#8B7AE8',
          strokeOpacity: 0.8,
          strokeWeight: 1.2,
          fillColor: '#6B8DD6',
          fillOpacity: coverageOpacity,
          map: map,
          zIndex: 1,
          geodesic: true
        });
        
        coveragePolygons.push(polygon);
        
        // Adicionar ao bounds para ajustar zoom
        for (const path of paths) {
          bounds.extend(path);
        }
      }
      
      console.log(`✅ ${coveragePolygons.length} polígono(s) renderizado(s) com sucesso!`);
      
    } catch (err) {
      console.error('❌ Erro ao renderizar polígono:', err);
      return;
    }

    // Ajustar zoom para mostrar toda a área coberta (opcional - não forçar se já houver busca)
    if (coveragePolygons.length > 0 && !selectedAddress) {
      try {
        google.maps.event.trigger(map, 'resize');
        await new Promise(resolve => setTimeout(resolve, 300));
        
        if (map && bounds && !bounds.isEmpty()) {
          map.fitBounds(bounds, {
            top: 50,
            right: 50,
            bottom: 50,
            left: 50
          });
          console.log(`✅ Zoom ajustado para mostrar toda a área de cobertura`);
        }
      } catch (err) {
        console.error('❌ Erro ao ajustar zoom:', err);
      }
    }
  }

  // Função para limpar mapa
  function clearMap() {
    markers.forEach(marker => {
      if (marker && marker.setMap) marker.setMap(null);
    });
    markers = [];

    searchMarkers.forEach(marker => {
      if (marker && marker.setMap) marker.setMap(null);
    });
    searchMarkers = [];

    routes.forEach(route => {
      if (route && route.setMap) route.setMap(null);
    });
    routes = [];

    if (directionsRenderer) {
      directionsRenderer.setDirections({ routes: [] });
    }
    
    // Não limpar polígonos de cobertura - eles devem permanecer visíveis
  }
  
  // Função para obter próximo VI ALA
  async function getNextVIALA() {
    loadingVIALA = true;
    try {
      const response = await fetch(getApiUrl('/api/vi-ala/next'));
      const data = await response.json();
      
      if (data.success && data.viAla) {
        nextVIALA = data.viAla;
        return data.viAla;
      } else {
        error = 'Erro ao obter próximo VI ALA';
        return null;
      }
    } catch (err) {
      console.error('Erro ao obter próximo VI ALA:', err);
      error = 'Erro ao obter próximo VI ALA';
      return null;
    } finally {
      loadingVIALA = false;
    }
  }
  
  // Função para salvar VI ALA
  async function saveVIALA() {
    if (!nextVIALA) {
      error = 'Por favor, obtenha um VI ALA primeiro';
      return;
    }
    
    if (!selectedAddress) {
      error = 'Por favor, busque um endereço primeiro';
      return;
    }
    
    loadingVIALA = true;
    try {
      const response = await fetch(getApiUrl('/api/vi-ala/save'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          viAla: nextVIALA,
          ala: ala || '',
          data: new Date().toLocaleString('pt-BR'),
          projetista: projetista || currentUser || '',
          cidade: cidade || '',
          endereco: enderecoInput,
          latitude: selectedAddress.lat,
          longitude: selectedAddress.lng
        })
      });
      
      const data = await response.json();
      
      if (data.success) {
        alert('VI ALA salvo com sucesso!');
        // Obter próximo VI ALA
        await getNextVIALA();
      } else {
        error = data.error || 'Erro ao salvar VI ALA';
      }
    } catch (err) {
      console.error('Erro ao salvar VI ALA:', err);
      error = 'Erro ao salvar VI ALA';
    } finally {
      loadingVIALA = false;
    }
  }
  
  
  // Inicialização
  onMount(async () => {
    isLoading = true;
    
    try {
      // Etapa 1: Carregando Mapa
      loadingMessage = 'Carregando Mapa';
      await initGoogleMaps();
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Etapa 2: Carregando Polígonos de Cobertura
      loadingMessage = 'Carregando Polígonos de Cobertura';
      let polygonLoaded = await loadCoveragePolygon();
      if (polygonLoaded) {
        console.log(`✅ Polígono de cobertura carregado`);
      } else {
        console.warn('⚠️ Nenhum polígono de cobertura encontrado.');
      }
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Etapa 3: Ajuste Finais
      loadingMessage = 'Ajuste Finais';
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Etapa 4: Abrindo Ferramenta
      loadingMessage = 'Abrindo Ferramenta';
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Aguardar DOM atualizar antes de inicializar o mapa
      await tick();
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Inicializar mapa
      initMap();
      
      // Aguardar mapa estar pronto
      if (map) {
        await new Promise((resolve) => {
          google.maps.event.addListenerOnce(map, 'idle', () => {
            console.log('✅ Mapa totalmente carregado');
            resolve();
          });
        });
      }
      
      // Aguardar um pouco para garantir que o mapa está renderizado
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Desenhar polígono de cobertura (se disponível)
      if (coveragePolygonGeoJSON && map) {
        console.log(`🎨 Desenhando polígono de cobertura...`);
        
        // Forçar redimensionamento do mapa
        google.maps.event.trigger(map, 'resize');
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Desenhar polígono de cobertura
        await drawCoverageArea();
        console.log(`✅ ${coveragePolygons.length} polígono(s) renderizado(s) - mancha de cobertura visível`);
        
        // Aguardar um pouco para garantir que tudo foi renderizado
        await new Promise(resolve => setTimeout(resolve, 500));
      } else if (!coveragePolygonGeoJSON) {
        console.warn('⚠️ Nenhum polígono de cobertura disponível. A ferramenta funcionará normalmente, mas sem visualização de cobertura.');
      }
      
      // Obter próximo VI ALA
      await getNextVIALA();
      
      console.log('✅ Ferramenta totalmente carregada e pronta para uso');
    } catch (err) {
      console.error('Erro ao inicializar:', err);
      error = 'Erro ao inicializar ferramenta';
    } finally {
      isLoading = false;
    }
  });
  
  // Cleanup
  onDestroy(() => {
    if (loadingDotsInterval) {
      clearInterval(loadingDotsInterval);
    }
    clearMap();
    
    // Limpar polígonos de cobertura
    coveragePolygons.forEach(polygon => {
      if (polygon && polygon.setMap) {
        polygon.setMap(null);
      }
    });
    coveragePolygons = [];
  });
  
  // Animação de loading dots
  $: if (loadingCTOs) {
    if (loadingDotsInterval) clearInterval(loadingDotsInterval);
    loadingDotsInterval = setInterval(() => {
      loadingDots = loadingDots.length >= 3 ? '.' : loadingDots + '.';
    }, 500);
  } else {
    if (loadingDotsInterval) {
      clearInterval(loadingDotsInterval);
      loadingDotsInterval = null;
    }
  }
</script>

{#if isLoading}
  <Loading message={loadingMessage} />
{:else}
  <div class="viabilidade-alares-content">
    <div class="main-layout">
      <!-- Painel de Busca -->
      <aside class="search-panel" class:minimized={isSearchPanelMinimized} style="width: {isSearchPanelMinimized ? '60px' : sidebarWidthStyle} !important; flex: 0 0 auto;">
        <div class="panel-header">
          <div class="panel-header-content">
            {#if !isSearchPanelMinimized}
              <h2>Viabilidade Alares</h2>
            {:else}
              <h2 class="vertical-title"></h2>
            {/if}
            <button 
              class="minimize-button" 
              disabled={isResizingSidebar || isResizingMapTable}
              on:click={() => isSearchPanelMinimized = !isSearchPanelMinimized}
              aria-label={isSearchPanelMinimized ? 'Expandir painel de busca' : 'Minimizar painel de busca'}
              title={isSearchPanelMinimized ? 'Expandir' : 'Minimizar'}
            >
              {isSearchPanelMinimized ? '➡️' : '⬅️'}
            </button>
          </div>
          {#if !isSearchPanelMinimized}
            <p>Busque endereços e localize CTOs</p>
          {/if}
        </div>
        
        {#if !isSearchPanelMinimized}
        
        <div class="search-form">
          <div class="form-group">
            <label for="endereco">Endereço</label>
            <textarea 
              id="endereco"
              bind:value={enderecoInput}
              placeholder="Insira o endereço do cliente"
              rows="3"
            ></textarea>
          </div>
          
          <button class="search-button" on:click={searchByEndereco} disabled={loadingCTOs}>
            {#if loadingCTOs}
              <span class="hourglass-icon">⏳</span> Buscando{loadingDots}
            {:else}
              Buscar CTOs
            {/if}
          </button>
          
          {#if error}
            <div class="error-message">⚠️ {error}</div>
          {/if}
          
          {#if ctos.length > 0}
            <div class="results-summary">
              ✅ {ctos.length} {ctos.length === 1 ? 'CTO encontrada' : 'CTOs encontradas'}
            </div>
            
            {#if calculatedRoutes.length > 0}
              <div class="route-info">
                <strong>CTO mais próxima:</strong> {calculatedRoutes[0].cto.nome || 'N/A'}<br>
                <strong>Distância:</strong> {(calculatedRoutes[0].distance / 1000).toFixed(2)} km
              </div>
            {/if}
          {/if}
        </div>
        
        <!-- Seção VI ALA -->
        <div class="vi-ala-section">
          <h3>VI ALA</h3>
          
          <div class="form-group">
            <label for="vi-ala">VI ALA</label>
            <input 
              id="vi-ala"
              type="text"
              bind:value={nextVIALA}
              readonly
              placeholder="Clique em 'Obter Próximo'"
            />
            <button 
              class="small-button" 
              on:click={getNextVIALA} 
              disabled={loadingVIALA}
            >
              {loadingVIALA ? 'Carregando...' : 'Obter Próximo'}
            </button>
          </div>
          
          <div class="form-group">
            <label for="ala">ALA</label>
            <input id="ala" type="text" bind:value={ala} placeholder="Número ALA" />
          </div>
          
          <div class="form-group">
            <label for="projetista">Projetista</label>
            <input id="projetista" type="text" bind:value={projetista} placeholder={currentUser || 'Nome do projetista'} />
          </div>
          
          <div class="form-group">
            <label for="cidade">Cidade</label>
            <input id="cidade" type="text" bind:value={cidade} placeholder="Cidade" />
          </div>
          
          <button class="save-button" on:click={saveVIALA} disabled={loadingVIALA || !nextVIALA}>
            Salvar VI ALA
          </button>
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
      
      <!-- Área Principal (Mapa e Tabela) -->
      <main class="main-area">
        <!-- Mapa -->
        <div class="map-container" class:minimized={isMapMinimized} style="height: {isMapMinimized ? '60px' : mapHeightStyle}; flex: 0 0 auto; min-height: {isMapMinimized ? '60px' : mapHeightStyle};">
          <div class="map-header">
            <h3>Mapa</h3>
            <button 
              class="minimize-button" 
              disabled={isResizingSidebar || isResizingMapTable}
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
          <div id="map" class="map" class:hidden={isMapMinimized} bind:this={mapElement}></div>
        </div>

        <!-- Handle de redimensionamento horizontal (mapa/tabela) -->
        <div 
          class="resize-handle resize-handle-horizontal"
          on:mousedown|stopPropagation={startResizeMapTable}
          on:touchstart|stopPropagation={startResizeMapTable}
          class:resizing={isResizingMapTable}
          role="separator"
          aria-label="Ajustar altura do mapa e tabela"
          tabindex="0"
        >
        </div>

        <!-- Tabela de Resultados -->
        {#if ctos.length > 0}
          <div class="results-table-container" class:minimized={isTableMinimized} style="flex: {isTableMinimized ? '0 0 auto' : '1 1 auto'}; min-height: {isTableMinimized ? '60px' : '200px'};">
            <div class="table-header">
              <h3>Tabela de CTOs Encontradas - {ctos.length} CTO(s)</h3>
              <button 
                class="minimize-button" 
                disabled={isResizingSidebar || isResizingMapTable}
                on:click={() => isTableMinimized = !isTableMinimized}
                aria-label={isTableMinimized ? 'Expandir tabela' : 'Minimizar tabela'}
                title={isTableMinimized ? 'Expandir' : 'Minimizar'}
              >
                {isTableMinimized ? '⬆️' : '⬇️'}
              </button>
            </div>
            {#if !isTableMinimized}
            <div class="table-wrapper">
              <table class="results-table">
                <thead>
                  <tr>
                    <th>N°</th>
                    <th>CTO</th>
                    <th>Latitude</th>
                    <th>Longitude</th>
                    <th>Cidade</th>
                    <th>POP</th>
                    <th>CHASSE</th>
                    <th>PLACA</th>
                    <th>OLT</th>
                    <th>ID CTO</th>
                    <th>Data de Criação</th>
                    <th>Portas Total</th>
                    <th>Ocupadas</th>
                    <th>Disponíveis</th>
                    <th>Ocupação</th>
                    <th>Status</th>
                    <th>Distância Rota</th>
                  </tr>
                </thead>
                <tbody>
                  {#each ctos as cto, rowIndex (getCTOKey(cto))}
                    {@const pctOcup = parseFloat(cto.pct_ocup || 0)}
                    {@const occupationClass = pctOcup < 50 ? 'low' : pctOcup >= 50 && pctOcup < 80 ? 'medium' : 'high'}
                    {@const routeInfo = calculatedRoutes.find(r => r.cto.id_cto === cto.id_cto || r.cto.id === cto.id)}
                    <tr>
                      <td class="numeric">{ctoNumbers.get(cto) || '-'}</td>
                      <td class="cto-name-cell"><strong>{cto.nome || 'N/A'}</strong></td>
                      <td class="numeric">{cto.latitude || ''}</td>
                      <td class="numeric">{cto.longitude || ''}</td>
                      <td>{cto.cidade || 'N/A'}</td>
                      <td>{cto.pop || 'N/A'}</td>
                      <td>{cto.olt || 'N/A'}</td>
                      <td>{cto.slot || 'N/A'}</td>
                      <td>{cto.pon || 'N/A'}</td>
                      <td>{cto.id_cto || cto.id || 'N/A'}</td>
                      <td>{formatDataCriacao(cto)}</td>
                      <td class="numeric">{cto.vagas_total || 0}</td>
                      <td class="numeric">{cto.clientes_conectados || 0}</td>
                      <td class="numeric">{(cto.vagas_total || 0) - (cto.clientes_conectados || 0)}</td>
                      <td>
                        <span class="occupation-badge {occupationClass}">{pctOcup.toFixed(1)}%</span>
                      </td>
                      <td>{cto.status_cto || 'N/A'}</td>
                      <td class="numeric">
                        {#if routeInfo}
                          {(routeInfo.distance / 1000).toFixed(2)} km
                        {:else}
                          -
                        {/if}
                      </td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
            {/if}
          </div>
        {/if}
      </main>
    </div>
  </div>
{/if}

<style>
  .viabilidade-alares-content {
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
  
  .search-panel.minimized {
    padding: 0.5rem;
    min-width: 60px !important;
    max-width: 60px !important;
    width: 60px !important;
  }
  
  .panel-header-content {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1rem;
  }
  
  .minimize-button {
    background: transparent;
    border: none;
    cursor: pointer;
    font-size: 1.25rem;
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
    transition: background 0.2s;
  }
  
  .minimize-button:hover:not(:disabled) {
    background: rgba(0, 0, 0, 0.05);
  }
  
  .minimize-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
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
  }
  
  .form-group input:focus,
  .form-group textarea:focus {
    outline: none;
    border-color: #7B68EE;
  }
  
  .search-button,
  .save-button {
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
  
  .search-button:hover,
  .save-button:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(100, 149, 237, 0.3);
  }
  
  .search-button:disabled,
  .save-button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
    transform: none;
  }
  
  .small-button {
    padding: 0.5rem 1rem;
    background: #7B68EE;
    color: white;
    border: none;
    border-radius: 6px;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    margin-top: 0.5rem;
  }
  
  .small-button:hover {
    background: #6B5BCE;
  }
  
  .small-button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
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
  
  .route-info {
    padding: 0.75rem;
    background: #eff6ff;
    border: 1px solid #bfdbfe;
    border-radius: 8px;
    color: #1e40af;
    font-size: 0.875rem;
  }
  
  .vi-ala-section {
    border-top: 2px solid #e5e7eb;
    padding-top: 1.5rem;
  }
  
  .vi-ala-section h3 {
    margin: 0 0 1rem 0;
    color: #4c1d95;
    font-size: 1.25rem;
    font-weight: 600;
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
  
  /* Handles de redimensionamento */
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
  
  .resize-handle-horizontal {
    height: 20px;
    cursor: row-resize !important;
    width: 100%;
    z-index: 10000 !important;
    pointer-events: auto !important;
    position: relative;
    margin: -4px 0;
    background: transparent;
    flex-shrink: 0;
    flex-grow: 0;
    align-self: stretch;
  }
  
  .resize-handle-horizontal::before {
    height: 2px;
    width: 100%;
    top: 50%;
    transform: translateY(-50%);
    pointer-events: none;
    background: rgba(100, 149, 237, 0.08);
  }
  
  /* Tabela de resultados */
  .results-table-container {
    background: white;
    border-radius: 12px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    padding: 1.5rem;
    display: flex;
    flex-direction: column;
    min-height: 200px;
    overflow: visible;
    flex: 1 1 auto;
    width: 100%;
    max-width: 100%;
    box-sizing: border-box;
  }
  
  .results-table-container.minimized {
    min-height: 60px;
    padding: 0.5rem 1.5rem;
  }
  
  .table-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
    flex-shrink: 0;
  }
  
  .table-header h3 {
    margin: 0;
    color: #4c1d95;
    font-size: 1.125rem;
    font-weight: 600;
  }
  
  .table-wrapper {
    overflow-x: auto;
    overflow-y: auto;
    flex: 1;
    min-height: 0;
  }
  
  .results-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.875rem;
  }
  
  .results-table thead {
    background-color: #f9fafb;
    position: sticky;
    top: 0;
    z-index: 10;
  }
  
  .results-table th {
    padding: 0.75rem;
    text-align: center;
    font-weight: 600;
    color: #374151;
    border-bottom: 2px solid #e5e7eb;
    white-space: nowrap;
    user-select: none;
    -webkit-user-select: none;
    -moz-user-select: none;
    -ms-user-select: none;
  }
  
  .results-table th:first-child {
    text-align: center;
    width: 50px;
  }
  
  .results-table th:nth-child(2) {
    text-align: center;
    width: 50px;
  }
  
  .results-table td {
    padding: 0.75rem;
    border-bottom: 1px solid #e5e7eb;
    color: #4b5563;
    text-align: center;
    user-select: none;
    -webkit-user-select: none;
    -moz-user-select: none;
    -ms-user-select: none;
  }
  
  .results-table .cto-name-cell {
    white-space: nowrap;
    min-width: 150px;
    text-align: center;
  }
  
  .results-table .numeric {
    text-align: center;
  }
  
  .results-table tbody tr:hover {
    background-color: #f9fafb;
  }
  
  .results-table tbody tr:nth-child(even) {
    background-color: #ffffff;
  }
  
  .results-table tbody tr:nth-child(even):hover {
    background-color: #f9fafb;
  }
  
  .occupation-badge {
    display: inline-block;
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
    font-weight: 600;
    font-size: 0.875rem;
  }
  
  .occupation-badge.low {
    background-color: #dcfce7;
    color: #166534;
  }
  
  .occupation-badge.medium {
    background-color: #fef3c7;
    color: #92400e;
  }
  
  .occupation-badge.high {
    background-color: #fee2e2;
    color: #991b1b;
  }
  
  .hourglass-icon {
    display: inline-block;
    animation: hourglass-rotate 1.5s linear infinite;
  }
  
  @keyframes hourglass-rotate {
    0% { transform: rotate(0deg); }
    25% { transform: rotate(90deg); }
    50% { transform: rotate(180deg); }
    75% { transform: rotate(270deg); }
    100% { transform: rotate(360deg); }
  }
</style>

