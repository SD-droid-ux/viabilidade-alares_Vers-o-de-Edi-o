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
  let coveragePolygons = []; // Array para armazenar polígonos de áreas densas
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
    if (!googleMapsLoaded) {
      console.warn('⚠️ Google Maps não está carregado');
      return;
    }

    const mapElement = document.getElementById('map-consulta');
    if (!mapElement) {
      console.warn('⚠️ Elemento do mapa não encontrado no DOM');
      return;
    }

    try {
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
    } catch (err) {
      console.error('❌ Erro ao inicializar mapa:', err);
      map = null;
    }
  }

  // Carregar todas as CTOs da base de dados
  async function loadAllCTOs() {
    try {
      loadingMessage = 'Carregando todas as CTOs da base de dados...';
      console.log('📥 Carregando TODAS as CTOs da base de dados...');
      
      // Estratégia: buscar CTOs em lotes cobrindo TODO o território brasileiro
      // Usando raios grandes (1500km) em pontos estratégicos para garantir cobertura completa
      // Aumentando o raio e adicionando mais pontos para pegar TODAS as CTOs
      const regions = [
        // Região Nordeste - pontos principais e interior
        { lat: -3.7172, lng: -38.5433, radius: 1500000, name: 'Fortaleza' }, // 1500km
        { lat: -8.0476, lng: -34.8770, radius: 1500000, name: 'Recife' },
        { lat: -12.9714, lng: -38.5014, radius: 1500000, name: 'Salvador' },
        { lat: -5.7950, lng: -35.2094, radius: 1500000, name: 'Natal' },
        { lat: -7.2400, lng: -39.4200, radius: 1500000, name: 'Juazeiro do Norte' },
        { lat: -5.0880, lng: -42.8019, radius: 1500000, name: 'Teresina' },
        { lat: -9.5713, lng: -36.7820, radius: 1500000, name: 'Maceió' },
        { lat: -7.2300, lng: -36.8300, radius: 1500000, name: 'Interior Nordeste' },
        // Região Sudeste
        { lat: -23.5505, lng: -46.6333, radius: 1500000, name: 'São Paulo' },
        { lat: -22.9068, lng: -43.1729, radius: 1500000, name: 'Rio de Janeiro' },
        { lat: -19.9167, lng: -43.9345, radius: 1500000, name: 'Belo Horizonte' },
        { lat: -20.3155, lng: -40.3128, radius: 1500000, name: 'Vitória' },
        { lat: -22.3145, lng: -49.0611, radius: 1500000, name: 'Bauru' },
        { lat: -21.1774, lng: -47.8103, radius: 1500000, name: 'Ribeirão Preto' },
        // Região Sul
        { lat: -30.0346, lng: -51.2177, radius: 1500000, name: 'Porto Alegre' },
        { lat: -25.4284, lng: -49.2733, radius: 1500000, name: 'Curitiba' },
        { lat: -27.5954, lng: -48.5480, radius: 1500000, name: 'Florianópolis' },
        { lat: -26.3044, lng: -48.8464, radius: 1500000, name: 'Joinville' },
        // Região Centro-Oeste
        { lat: -15.7942, lng: -47.8822, radius: 1500000, name: 'Brasília' },
        { lat: -20.4428, lng: -54.6458, radius: 1500000, name: 'Campo Grande' },
        { lat: -16.6864, lng: -49.2643, radius: 1500000, name: 'Goiânia' },
        { lat: -15.6014, lng: -56.0979, radius: 1500000, name: 'Cuiabá' },
        // Região Norte
        { lat: -3.1190, lng: -60.0217, radius: 1500000, name: 'Manaus' },
        { lat: -1.4558, lng: -48.5044, radius: 1500000, name: 'Belém' },
        { lat: -8.7619, lng: -63.9039, radius: 1500000, name: 'Porto Velho' },
        { lat: -10.1833, lng: -48.3336, radius: 1500000, name: 'Palmas' },
        { lat: -9.9747, lng: -67.8100, radius: 1500000, name: 'Rio Branco' },
        { lat: -2.5297, lng: -44.3028, radius: 1500000, name: 'São Luís' },
        { lat: -0.9500, lng: -48.4500, radius: 1500000, name: 'Macapá' },
        // Pontos adicionais para garantir cobertura completa de todo o Brasil
        { lat: -14.2350, lng: -42.4333, radius: 1500000, name: 'Centro-Norte' },
        { lat: -10.0, lng: -50.0, radius: 1500000, name: 'Centro-Brasil' },
      ];

      const allCTOsMap = new Map(); // Usar Map para evitar duplicatas por coordenadas
      let totalFound = 0;
      let regionsProcessed = 0;

      // Buscar CTOs em paralelo para todas as regiões
      const regionPromises = regions.map(async (region) => {
        try {
          console.log(`🔍 Buscando CTOs na região de ${region.name} (raio: ${region.radius/1000}km)...`);
          const response = await fetch(getApiUrl(`/api/ctos/nearby?lat=${region.lat}&lng=${region.lng}&radius=${region.radius}`));
          if (!response.ok) {
            console.warn(`⚠️ Erro ao buscar CTOs na região ${region.name}`);
            return { region: region.name, ctos: [] };
          }
          const data = await response.json();
          if (data.success && data.ctos) {
            console.log(`✅ ${data.ctos.length} CTOs encontradas na região de ${region.name}`);
            return { region: region.name, ctos: data.ctos };
          }
          return { region: region.name, ctos: [] };
        } catch (err) {
          console.warn(`⚠️ Erro ao buscar CTOs na região ${region.name}:`, err);
          return { region: region.name, ctos: [] };
        }
      });

      const regionResults = await Promise.all(regionPromises);

      // Consolidar todas as CTOs (evitando duplicatas)
      for (const { region, ctos } of regionResults) {
        regionsProcessed++;
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
      console.log(`✅ ${allCTOs.length} CTOs únicas carregadas de ${regionsProcessed} regiões processadas`);
      console.log(`📊 Total de CTOs na base: ${allCTOs.length}`);
      
      return allCTOs;
    } catch (err) {
      console.error('Erro ao carregar CTOs:', err);
      throw err;
    }
  }

  // Função auxiliar para calcular distância entre duas coordenadas
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

  // Função para criar polígono que representa a união de círculos próximos
  function createUnionPolygon(ctos) {
    if (ctos.length === 0) return null;
    
    // Se for apenas uma CTO, criar círculo individual
    if (ctos.length === 1) {
      const cto = ctos[0];
      const lat = parseFloat(cto.latitude);
      const lng = parseFloat(cto.longitude);
      
      const circle = new google.maps.Circle({
        strokeColor: '#7B68EE',
        strokeOpacity: 0.6,
        strokeWeight: 1,
        fillColor: '#6495ED',
        fillOpacity: 0.35,
        map: map,
        center: { lat, lng },
        radius: 250,
        zIndex: 1,
        optimized: false // Desabilitar otimização para garantir visibilidade
      });
      
      console.log(`✅ Círculo criado para CTO: lat=${lat}, lng=${lng}`);
      return circle;
    }
    
    // Para múltiplas CTOs próximas, criar um polígono que representa a área coberta
    // Calcular bounding box expandido pelo raio de 250m
    const RADIUS_M = 250; // Raio em metros
    const RADIUS_DEG = RADIUS_M / 111000; // Raio em graus (aproximação)
    
    let minLat = Infinity;
    let maxLat = -Infinity;
    let minLng = Infinity;
    let maxLng = -Infinity;
    
    for (const cto of ctos) {
      const lat = parseFloat(cto.latitude);
      const lng = parseFloat(cto.longitude);
      
      // Expandir pelo raio
      const latRadius = RADIUS_DEG;
      const lngRadius = RADIUS_DEG / Math.cos(lat * Math.PI / 180);
      
      minLat = Math.min(minLat, lat - latRadius);
      maxLat = Math.max(maxLat, lat + latRadius);
      minLng = Math.min(minLng, lng - lngRadius);
      maxLng = Math.max(maxLng, lng + lngRadius);
    }
    
    // Criar polígono retangular que cobre toda a área (simplificado mas eficiente)
    const polygonPath = [
      { lat: minLat, lng: minLng },
      { lat: maxLat, lng: minLng },
      { lat: maxLat, lng: maxLng },
      { lat: minLat, lng: maxLng }
    ];
    
    const polygon = new google.maps.Polygon({
      paths: polygonPath,
      strokeColor: '#7B68EE',
      strokeOpacity: 0.6,
      strokeWeight: 1,
      fillColor: '#6495ED',
      fillOpacity: 0.35,
      map: map,
      zIndex: 1
    });
    
    console.log(`✅ Polígono criado para ${ctos.length} CTOs: bounds=[${minLat.toFixed(4)}, ${minLng.toFixed(4)}] a [${maxLat.toFixed(4)}, ${maxLng.toFixed(4)}]`);
    return polygon;
  }

  // Desenhar mancha de cobertura no mapa (otimizado: polígonos para áreas densas, círculos para bordas)
  async function drawCoverageArea() {
    // Verificar se tudo está pronto
    if (!map) {
      console.error('❌ Mapa não está inicializado');
      return;
    }
    
    if (!google || !google.maps) {
      console.error('❌ Google Maps não está carregado');
      return;
    }
    
    if (!allCTOs || allCTOs.length === 0) {
      console.warn('⚠️ Nenhuma CTO carregada para desenhar');
      return;
    }

    // Verificar se o mapa está realmente visível no DOM
    const mapElement = document.getElementById('map-consulta');
    if (!mapElement) {
      console.error('❌ Elemento do mapa não encontrado no DOM');
      return;
    }
    
    // Verificar se o mapa tem dimensões válidas
    const mapRect = mapElement.getBoundingClientRect();
    if (mapRect.width === 0 || mapRect.height === 0) {
      console.warn('⚠️ Mapa não tem dimensões válidas, aguardando...');
      await new Promise(resolve => setTimeout(resolve, 500));
      google.maps.event.trigger(map, 'resize');
      await new Promise(resolve => setTimeout(resolve, 300));
    }

    console.log(`🗺️ Desenhando mancha de cobertura com ${allCTOs.length} CTOs...`);
    console.log(`📐 Dimensões do mapa: ${mapRect.width}x${mapRect.height}`);

    // Limpar círculos anteriores
    clearCoverageCircles();

    // Aguardar um pouco para garantir que o mapa está totalmente renderizado
    await new Promise(resolve => setTimeout(resolve, 200));

    const bounds = new google.maps.LatLngBounds();
    let circlesCreated = 0;
    let skipped = 0;

    // Otimização: renderizar em lotes para não travar o navegador
    const BATCH_SIZE = 1000; // Processar 1000 círculos por vez
    const DELAY_BETWEEN_BATCHES = 10; // 10ms entre lotes (permite que o navegador respire)
    
    // Filtrar CTOs válidas primeiro
    const validCTOs = allCTOs.filter(cto => {
      if (!cto.latitude || !cto.longitude) {
        skipped++;
        return false;
      }
      const lat = parseFloat(cto.latitude);
      const lng = parseFloat(cto.longitude);
      if (isNaN(lat) || isNaN(lng)) {
        skipped++;
        return false;
      }
      return true;
    });

    console.log(`📊 ${validCTOs.length} CTOs válidas para desenhar (${skipped} ignoradas)`);

    // Estratégia: Agrupar CTOs próximas (que se sobrepõem) e criar polígonos
    // CTOs isoladas ou em grupos pequenos: círculos individuais (bordas)
    const OVERLAP_DISTANCE = 500; // Se duas CTOs estão a menos de 500m, elas se sobrepõem
    
    // Agrupar CTOs por proximidade
    const groups = [];
    const processedIndices = new Set();
    
    for (let i = 0; i < validCTOs.length; i++) {
      if (processedIndices.has(i)) continue;
      
      const cto = validCTOs[i];
      const lat1 = parseFloat(cto.latitude);
      const lng1 = parseFloat(cto.longitude);
      
      const group = [cto];
      processedIndices.add(i);
      
      // Encontrar todas as CTOs próximas (que se sobrepõem)
      for (let j = i + 1; j < validCTOs.length; j++) {
        if (processedIndices.has(j)) continue;
        
        const otherCto = validCTOs[j];
        const lat2 = parseFloat(otherCto.latitude);
        const lng2 = parseFloat(otherCto.longitude);
        
        const distance = calculateDistance(lat1, lng1, lat2, lng2);
        
        // Se estão próximas o suficiente para sobrepor (500m = 2x raio de 250m)
        if (distance <= OVERLAP_DISTANCE) {
          group.push(otherCto);
          processedIndices.add(j);
        }
      }
      
      groups.push(group);
    }
    
    console.log(`📊 ${groups.length} grupos identificados (áreas densas e isoladas)`);
    
    // Processar grupos - SEM sobreposição
    // Primeiro, identificar quais CTOs já estão cobertas por polígonos
    const coveredByPolygons = new Set(); // Índices de CTOs já cobertas por polígonos
    
    let groupsProcessed = 0;
    let polygonsCreated = 0;
    
    // FASE 1: Criar polígonos para áreas densas (sem sobreposição)
    for (const group of groups) {
      groupsProcessed++;
      
      // Se grupo tem muitas CTOs (área densa), criar polígono
      if (group.length >= 5) {
        // Área densa: criar polígono único
        try {
          const polygon = createUnionPolygon(group);
          if (polygon) {
            if (polygon instanceof google.maps.Polygon) {
              coveragePolygons.push(polygon);
              polygonsCreated++;
              console.log(`✅ Polígono criado para grupo com ${group.length} CTOs`);
            } else if (polygon instanceof google.maps.Circle) {
              coverageCircles.push(polygon);
              circlesCreated++;
              console.log(`✅ Círculo criado para grupo com ${group.length} CTOs`);
            }
            
            // Marcar todas as CTOs deste grupo como cobertas por polígono
            for (let i = 0; i < validCTOs.length; i++) {
              const cto = validCTOs[i];
              const isInGroup = group.some(g => 
                Math.abs(parseFloat(g.latitude) - parseFloat(cto.latitude)) < 0.0001 &&
                Math.abs(parseFloat(g.longitude) - parseFloat(cto.longitude)) < 0.0001
              );
              if (isInGroup) {
                coveredByPolygons.add(i);
              }
            }
            
            // Adicionar ao bounds
            for (const cto of group) {
              bounds.extend({ 
                lat: parseFloat(cto.latitude), 
                lng: parseFloat(cto.longitude) 
              });
            }
          } else {
            console.warn(`⚠️ createUnionPolygon retornou null para grupo com ${group.length} CTOs`);
          }
        } catch (err) {
          console.error(`❌ Erro ao criar polígono para grupo com ${group.length} CTOs:`, err);
        }
      }
      
      // Pequena pausa para não travar
      if (groupsProcessed % 100 === 0) {
        await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES));
      }
    }
    
    console.log(`✅ FASE 1 concluída: ${polygonsCreated} polígonos criados para áreas densas`);
    
    // FASE 2: Criar círculos individuais apenas para CTOs NÃO cobertas por polígonos (bordas/isoladas)
    // E garantir que círculos não se sobreponham
    let circlesPhase2Created = 0;
    for (let i = 0; i < groups.length; i++) {
      const group = groups[i];
      
      // Se grupo é pequeno (bordas/isoladas) E não está coberto por polígono
      if (group.length < 5) {
        // Verificar se alguma CTO do grupo já está coberta por polígono
        let groupIsCovered = false;
        for (const cto of group) {
          const ctoIndex = validCTOs.findIndex(v => 
            Math.abs(parseFloat(v.latitude) - parseFloat(cto.latitude)) < 0.0001 &&
            Math.abs(parseFloat(v.longitude) - parseFloat(cto.longitude)) < 0.0001
          );
          if (ctoIndex >= 0 && coveredByPolygons.has(ctoIndex)) {
            groupIsCovered = true;
            break;
          }
        }
        
        // Só criar círculos se o grupo NÃO estiver coberto por polígono
        if (!groupIsCovered) {
          // Se o grupo tem 2-4 CTOs próximas, criar um polígono pequeno (evita sobreposição)
          if (group.length >= 2) {
            try {
              const polygon = createUnionPolygon(group);
              if (polygon) {
                if (polygon instanceof google.maps.Polygon) {
                  coveragePolygons.push(polygon);
                  polygonsCreated++;
                  console.log(`✅ Polígono pequeno criado para grupo com ${group.length} CTOs`);
                } else if (polygon instanceof google.maps.Circle) {
                  coverageCircles.push(polygon);
                  circlesCreated++;
                  circlesPhase2Created++;
                  console.log(`✅ Círculo criado para grupo com ${group.length} CTOs`);
                }
                
                // Adicionar ao bounds
                for (const cto of group) {
                  bounds.extend({ 
                    lat: parseFloat(cto.latitude), 
                    lng: parseFloat(cto.longitude) 
                  });
                }
              }
            } catch (err) {
              console.error(`❌ Erro ao criar polígono pequeno para grupo com ${group.length} CTOs:`, err);
            }
          } else {
            // Grupo com apenas 1 CTO (isolada) - criar círculo individual
            const cto = group[0];
            const lat = parseFloat(cto.latitude);
            const lng = parseFloat(cto.longitude);

            bounds.extend({ lat, lng });

            try {
              const circle = new google.maps.Circle({
                strokeColor: '#7B68EE',
                strokeOpacity: 0.6,
                strokeWeight: 1,
                fillColor: '#6495ED',
                fillOpacity: 0.35,
                map: map,
                center: { lat, lng },
                radius: 250,
                zIndex: 1,
                optimized: false // Desabilitar otimização para garantir visibilidade
              });

              coverageCircles.push(circle);
              circlesCreated++;
              circlesPhase2Created++;
              
              if (circlesPhase2Created % 100 === 0) {
                console.log(`📊 ${circlesPhase2Created} círculos individuais criados...`);
              }
            } catch (circleErr) {
              console.error(`❌ Erro ao criar círculo para CTO ${cto.nome}:`, circleErr);
              skipped++;
            }
          }
        }
      }
    }
    
    console.log(`✅ FASE 2 concluída: ${circlesPhase2Created} círculos individuais criados para bordas/isoladas`);
    
    console.log(`✅ RESUMO: ${coveragePolygons.length} polígonos + ${circlesCreated} círculos criados`);
    console.log(`   - Polígonos: ${coveragePolygons.length}`);
    console.log(`   - Círculos: ${circlesCreated}`);
    console.log(`   - Total de elementos no mapa: ${coveragePolygons.length + circlesCreated}`);
    
    // Verificar se os elementos foram realmente adicionados ao mapa
    if (coveragePolygons.length === 0 && circlesCreated === 0) {
      console.error('❌ ERRO: Nenhum elemento foi criado! Verifique os dados das CTOs.');
      
      // TESTE: Tentar criar um círculo de teste para verificar se o problema é com a criação
      console.log('🧪 Criando círculo de teste...');
      try {
        const testCircle = new google.maps.Circle({
          strokeColor: '#FF0000', // Vermelho para teste
          strokeOpacity: 1,
          strokeWeight: 2,
          fillColor: '#FF0000',
          fillOpacity: 0.5,
          map: map,
          center: { lat: -23.5505, lng: -46.6333 }, // São Paulo
          radius: 1000,
          zIndex: 999
        });
        console.log('✅ Círculo de teste criado com sucesso! Se você vê um círculo vermelho em São Paulo, o problema é com os dados das CTOs.');
      } catch (testErr) {
        console.error('❌ Erro ao criar círculo de teste:', testErr);
      }
    } else {
      // Verificar se os elementos estão visíveis no mapa
      let visiblePolygons = 0;
      let visibleCircles = 0;
      
      coveragePolygons.forEach(poly => {
        if (poly && poly.getMap && poly.getMap() === map) {
          visiblePolygons++;
        }
      });
      
      coverageCircles.forEach(circle => {
        if (circle && circle.getMap && circle.getMap() === map) {
          visibleCircles++;
        }
      });
      
      console.log(`✅ Verificação: ${visiblePolygons}/${coveragePolygons.length} polígonos visíveis, ${visibleCircles}/${circlesCreated} círculos visíveis`);
      
      // Se nenhum elemento está visível, pode ser um problema de renderização
      if (visiblePolygons === 0 && visibleCircles === 0 && (coveragePolygons.length > 0 || circlesCreated > 0)) {
        console.error('❌ ERRO: Elementos foram criados mas não estão visíveis no mapa!');
        console.log('   Tentando forçar atualização do mapa...');
        google.maps.event.trigger(map, 'resize');
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Verificar novamente
        let retryVisiblePolygons = 0;
        let retryVisibleCircles = 0;
        coveragePolygons.forEach(poly => {
          if (poly && poly.getMap && poly.getMap() === map) {
            retryVisiblePolygons++;
          }
        });
        coverageCircles.forEach(circle => {
          if (circle && circle.getMap && circle.getMap() === map) {
            retryVisibleCircles++;
          }
        });
        console.log(`   Após retry: ${retryVisiblePolygons} polígonos, ${retryVisibleCircles} círculos visíveis`);
      }
    }

    if (skipped > 0) {
      console.warn(`⚠️ ${skipped} CTOs ignoradas (coordenadas inválidas)`);
    }

    // Ajustar zoom para mostrar toda a área coberta (todas as manchas)
    if (circlesCreated > 0 || coveragePolygons.length > 0) {
      try {
        // Forçar redimensionamento do mapa
        google.maps.event.trigger(map, 'resize');
        
        await new Promise(resolve => setTimeout(resolve, 300));
        
        if (map && bounds && !bounds.isEmpty()) {
          // Ajustar zoom para mostrar TODA a área coberta por todas as CTOs
          map.fitBounds(bounds, {
            top: 50,
            right: 50,
            bottom: 50,
            left: 50
          });
          console.log(`✅ Zoom ajustado para mostrar toda a área de cobertura (${coveragePolygons.length} polígonos + ${circlesCreated} círculos)`);
        } else {
          // Fallback: centralizar no Brasil se bounds estiver vazio
          map.setCenter({ lat: -14.2350, lng: -51.9253 }); // Centro geográfico do Brasil
          map.setZoom(5);
          console.log('✅ Zoom ajustado para centro do Brasil (fallback)');
        }
      } catch (err) {
        console.error('❌ Erro ao ajustar zoom:', err);
        // Fallback: centralizar no Brasil
        try {
          map.setCenter({ lat: -14.2350, lng: -51.9253 });
          map.setZoom(5);
        } catch (fallbackErr) {
          console.error('❌ Erro no fallback de zoom:', fallbackErr);
        }
      }
    } else {
      console.error('❌ Nenhum círculo foi criado!');
    }
  }

  // Limpar círculos e polígonos de cobertura
  function clearCoverageCircles() {
    coverageCircles.forEach(circle => {
      if (circle && circle.setMap) {
        circle.setMap(null);
      }
    });
    coverageCircles = [];
    
    coveragePolygons.forEach(polygon => {
      if (polygon && polygon.setMap) {
        polygon.setMap(null);
      }
    });
    coveragePolygons = [];
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
      
      // Pequeno delay para visualização
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Etapa 2: Verificando Base de dados
      loadingMessage = 'Verificando Base de dados';
      baseDataExists = true; // Resetar estado
      try {
        // Verificar se há CTOs na base fazendo uma busca de teste
        const testResponse = await fetch(getApiUrl('/api/ctos/nearby?lat=-23.5505&lng=-46.6333&radius=1000'));
        if (testResponse.ok) {
          const testData = await testResponse.json();
          baseDataExists = testData.success && testData.ctos && testData.ctos.length > 0;
        }
      } catch (err) {
        console.warn('Aviso: Não foi possível verificar base de dados:', err.message);
        baseDataExists = false;
      }
      
      // Pequeno delay para visualização
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Etapa 3: Carregando CTOs
      loadingMessage = 'Carregando CTOs';
      await loadAllCTOs();
      console.log(`✅ ${allCTOs.length} CTOs carregadas`);
      
      // Pequeno delay para visualização
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Etapa 4: Ajuste Finais
      loadingMessage = 'Ajuste Finais';
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Etapa 5: Abrindo Ferramenta
      loadingMessage = 'Abrindo Ferramenta';
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Só agora terminar o loading - o elemento do mapa vai aparecer no DOM
      isLoading = false;
      console.log('✅ Loading finalizado, elemento do mapa agora está no DOM');
      
      // Aguardar DOM atualizar completamente e elemento do mapa estar disponível
      await tick();
      
      // Tentar encontrar o elemento do mapa (pode levar alguns ciclos)
      let mapElement = null;
      let attempts = 0;
      while (!mapElement && attempts < 10) {
        mapElement = document.getElementById('map-consulta');
        if (!mapElement) {
          await new Promise(resolve => setTimeout(resolve, 100));
          attempts++;
        }
      }
      
      if (!mapElement) {
        console.error('❌ Elemento do mapa não encontrado após múltiplas tentativas');
        return;
      }
      
      console.log('✅ Elemento do mapa encontrado no DOM');
      
      // AGORA inicializar o mapa (elemento já existe no DOM)
      console.log('🗺️ Inicializando mapa...');
      initMap();
      
      // Se não conseguiu inicializar, tentar novamente
      if (!map) {
        console.warn('⚠️ Primeira tentativa falhou, tentando novamente...');
        await new Promise(resolve => setTimeout(resolve, 500));
        await tick();
        initMap();
      }
      
      // Aguardar mapa estar pronto
      if (map) {
        await new Promise((resolve) => {
          google.maps.event.addListenerOnce(map, 'idle', () => {
            console.log('✅ Mapa totalmente carregado');
            resolve();
          });
        });
      } else {
        console.error('❌ Não foi possível inicializar o mapa após múltiplas tentativas');
        return;
      }
      
      // Aguardar um pouco para garantir que o mapa está renderizado
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Desenhar TODAS as manchas de cobertura
      if (allCTOs.length > 0 && map) {
        console.log(`🎨 Desenhando ${allCTOs.length} manchas de cobertura em todo o Brasil...`);
        
        // Forçar redimensionamento do mapa
        google.maps.event.trigger(map, 'resize');
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Desenhar TODAS as manchas de cobertura
        await drawCoverageArea();
        console.log(`✅ ${coveragePolygons.length} polígonos + ${coverageCircles.length} círculos criados - manchas visíveis em todo o Brasil`);
        
        // Aguardar um pouco para garantir que tudo foi renderizado
        await new Promise(resolve => setTimeout(resolve, 500));
      } else if (allCTOs.length === 0) {
        console.warn('⚠️ Nenhuma CTO carregada para desenhar');
      } else if (!map) {
        console.error('❌ Mapa não foi inicializado, não é possível desenhar manchas');
      }
      
      console.log('✅ Ferramenta totalmente carregada e pronta para uso');
      
    } catch (err) {
      console.error('❌ Erro ao inicializar ferramenta:', err);
      error = 'Erro ao inicializar ferramenta: ' + err.message;
      isLoading = false;
      
      // Tentar inicializar o mapa mesmo com erro
      await tick();
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Tentar encontrar elemento e inicializar
      let mapElement = document.getElementById('map-consulta');
      if (mapElement && !map) {
        console.log('🔄 Tentando inicializar mapa após erro...');
        initMap();
        
        // Se conseguiu inicializar, tentar desenhar manchas
        if (map && allCTOs.length > 0) {
          await new Promise(resolve => setTimeout(resolve, 500));
          await drawCoverageArea();
        }
      }
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
    <Loading currentMessage={loadingMessage} />
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
                      // Se temos CTOs carregadas mas não temos círculos, redesenhar
                      if (allCTOs.length > 0 && coverageCircles.length === 0) {
                        console.log('🔄 Redesenhando mancha após expandir mapa...');
                        drawCoverageArea();
                      }
                    }
                  }, 200);
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
