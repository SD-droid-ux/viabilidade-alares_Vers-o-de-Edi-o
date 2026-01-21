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
  
  // Mapa para controlar quais CTOs estão visíveis no mapa (key: identificador único da CTO)
  let ctoVisibility = new Map(); // Map<ctoKey, boolean>
  
  // Estados de ordenação e filtros
  let sortColumn = null; // Nome da coluna sendo ordenada
  let sortDirection = 'asc'; // 'asc' ou 'desc'
  let filters = {}; // Objeto com filtros por coluna: { coluna: { type: 'text'|'number'|'min', value: ... } }
  let columnVisibility = {}; // Objeto com visibilidade de colunas: { coluna: true/false }
  let showFilterMenu = null; // Coluna que está mostrando o menu de filtro
  
  // CTOs filtradas e ordenadas
  let filteredAndSortedCTOs = [];
  
  // Função para gerar uma chave única para uma CTO (declarada aqui para uso nos reactive statements)
  function getCTOKey(cto) {
    // Usar nome + coordenadas para criar chave única
    const lat = parseFloat(cto.latitude || 0).toFixed(6);
    const lng = parseFloat(cto.longitude || 0).toFixed(6);
    return `${cto.nome || 'UNKNOWN'}_${lat}_${lng}`;
  }
  
  // Função para gerar chave do caminho de rede (CIDADE|POP|CHASSE|PLACA|OLT)
  function getCaminhoRedeKey(cto) {
    const cidade = (cto.cidade || 'N/A').trim();
    const pop = (cto.pop || 'N/A').trim();
    const chasse = (cto.olt || 'N/A').trim();
    const placa = (cto.slot || 'N/A').trim();
    const olt = (cto.pon || 'N/A').trim();
    return `${cidade}|${pop}|${chasse}|${placa}|${olt}`;
  }
  
  // Map para armazenar o total de portas por caminho de rede (busca da base de dados)
  let caminhoRedeTotals = new Map();
  // Map para armazenar o total de CTOs por caminho de rede
  let caminhoRedeCTOsTotals = new Map();
  let caminhoRedeLoading = new Set(); // Caminhos que estão sendo carregados
  let caminhosCarregando = false; // Flag para indicar se ainda está carregando totais
  let calculandoTotais = false; // Flag para evitar múltiplas execuções simultâneas
  let ultimosCaminhosCalculados = new Set(); // Rastrear quais caminhos já foram calculados
  
  // Código de seleção manual pode ser implementado se necessário
  
  // Função para buscar total de portas do caminho de rede da base de dados
  async function fetchCaminhoRedeTotal(olt, slot, pon) {
    const caminhoKey = `${olt}|${slot}|${pon}`;
    
    // Se já está carregando ou já tem o valor, retornar
    if (caminhoRedeLoading.has(caminhoKey) || caminhoRedeTotals.has(caminhoKey)) {
      return caminhoRedeTotals.get(caminhoKey) || 0;
    }
    
    // Se algum valor é N/A ou vazio, não buscar
    if (!olt || !slot || !pon || olt === 'N/A' || slot === 'N/A' || pon === 'N/A' || olt.trim() === '' || slot.trim() === '' || pon.trim() === '') {
      console.warn(`⚠️ Valores inválidos para caminho de rede: olt="${olt}", slot="${slot}", pon="${pon}"`);
      return 0;
    }
    
    // Marcar como carregando
    caminhoRedeLoading.add(caminhoKey);
    
    try {
      const url = getApiUrl(`/api/ctos/caminho-rede?olt=${encodeURIComponent(olt)}&slot=${encodeURIComponent(slot)}&pon=${encodeURIComponent(pon)}`);
      console.log(`🌐 Fazendo requisição para: ${url}`);
      
      const response = await fetch(url);
      
      if (!response.ok) {
        console.error(`❌ Resposta HTTP não OK: ${response.status} ${response.statusText}`);
        const errorText = await response.text();
        console.error(`Erro: ${errorText}`);
        return 0;
      }
      
      const data = await response.json();
      console.log(`📥 Resposta da API para ${olt} / ${slot} / ${pon}:`, data);
      
      if (data.success && data.total_portas !== undefined) {
        // Atualizar o Map (criar novo para garantir reatividade)
        // IMPORTANTE: Usar o Map atual para não perder valores já carregados
        const currentTotals = caminhoRedeTotals || new Map();
        const newTotals = new Map(currentTotals);
        newTotals.set(caminhoKey, data.total_portas);
        caminhoRedeTotals = newTotals;
        
        console.log(`✅ Total de portas para ${olt} / ${slot} / ${pon}: ${data.total_portas} (${data.total_ctos} CTOs)`);
        console.log(`📊 Map atualizado. Tamanho: ${caminhoRedeTotals.size}, Chaves:`, Array.from(caminhoRedeTotals.keys()));
        return data.total_portas;
      } else {
        console.warn(`⚠️ Resposta da API não tem success=true ou total_portas:`, data);
        return 0;
      }
    } catch (err) {
      console.error(`❌ Erro ao buscar total de portas para ${olt} / ${slot} / ${pon}:`, err);
      return 0;
    } finally {
      caminhoRedeLoading.delete(caminhoKey);
    }
  }
  
  // Função OTIMIZADA para calcular e buscar totais de todos os caminhos de rede únicos
  // Usa uma única requisição batch em vez de múltiplas requisições individuais
  async function calculateCaminhoRedeTotals() {
    // Evitar execuções simultâneas
    if (calculandoTotais) {
      console.log('⏸️ Cálculo já em andamento, ignorando chamada duplicada');
      return;
    }
    
    // Coletar todos os caminhos de rede únicos das CTOs
    const caminhosUnicos = new Set();
    for (const cto of ctos) {
      const caminhoKey = getCaminhoRedeKey(cto);
      // Verificar se o caminho é válido (não é N/A e não está vazio)
      // Formato da chave: CIDADE|POP|CHASSE|PLACA|OLT (5 partes separadas por |)
      if (caminhoKey && !caminhoKey.includes('N/A') && caminhoKey !== '||||' && caminhoKey.split('|').length === 5) {
        caminhosUnicos.add(caminhoKey);
      }
    }
    
    // Verificar se os caminhos mudaram
    const caminhosString = Array.from(caminhosUnicos).sort().join(',');
    const ultimosCaminhosString = Array.from(ultimosCaminhosCalculados).sort().join(',');
    
    if (caminhosString === ultimosCaminhosString && caminhoRedeTotals.size > 0) {
      console.log('✅ Caminhos não mudaram e já temos os valores, pulando recálculo');
      return;
    }
    
    // Marcar como calculando
    calculandoTotais = true;
    caminhosCarregando = true;
    
    // Limpar apenas os caminhos que não estão mais presentes
    const novosCaminhos = new Set(caminhosUnicos);
    const caminhosParaRemover = [];
    for (const key of caminhoRedeTotals.keys()) {
      if (!novosCaminhos.has(key)) {
        caminhosParaRemover.push(key);
      }
    }
    for (const key of caminhosParaRemover) {
      caminhoRedeTotals.delete(key);
      caminhoRedeCTOsTotals.delete(key);
    }
    
    caminhoRedeLoading.clear();
    
    console.log(`🔍 Calculando totais para ${caminhosUnicos.size} caminhos de rede únicos:`, Array.from(caminhosUnicos));
    
    if (caminhosUnicos.size === 0) {
      console.warn('⚠️ Nenhum caminho de rede válido encontrado nas CTOs');
      calculandoTotais = false;
      caminhosCarregando = false;
      return;
    }
    
    // Filtrar apenas caminhos que ainda não foram calculados
    const todosCaminhos = Array.from(caminhosUnicos);
    const caminhosParaCalcular = todosCaminhos.filter(key => !caminhoRedeTotals.has(key));
    
    if (caminhosParaCalcular.length === 0) {
      console.log('✅ Todos os caminhos já foram calculados');
      ultimosCaminhosCalculados = novosCaminhos;
      calculandoTotais = false;
      caminhosCarregando = false;
      caminhoRedeTotalsVersion++;
      return;
    }
    
    console.log(`📦 Buscando ${caminhosParaCalcular.length} novos caminhos de ${todosCaminhos.length} totais em uma única requisição batch`);
    
    try {
      // Preparar array de caminhos para a requisição batch
      // IMPORTANTE: A chave é gerada como CIDADE|POP|CHASSE|PLACA|OLT
      // Onde CHASSE = cto.olt, PLACA = cto.slot, OLT = cto.pon
      // Mas o backend espera olt, slot, pon nessa ordem
      const caminhosArray = caminhosParaCalcular.map(caminhoKey => {
        const [cidade, pop, chasse, placa, olt] = caminhoKey.split('|');
        // Mapear corretamente: chasse -> olt, placa -> slot, olt -> pon
        return { cidade, pop, olt: chasse, slot: placa, pon: olt };
      });
      
      // Fazer uma única requisição POST com todos os caminhos
      const url = getApiUrl('/api/ctos/caminhos-rede-batch');
      console.log(`🚀 Fazendo requisição batch para ${caminhosArray.length} caminhos`);
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ caminhos: caminhosArray })
      });
      
      if (!response.ok) {
        console.error(`❌ Resposta HTTP não OK: ${response.status} ${response.statusText}`);
        const errorText = await response.text();
        console.error(`Erro: ${errorText}`);
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }
      
      const data = await response.json();
      
      if (data.success && data.resultados) {
        // Atualizar o Map com todos os resultados de uma vez (portas e CTOs)
        const newTotals = new Map(caminhoRedeTotals);
        const newCTOsTotals = new Map(caminhoRedeCTOsTotals);
        
        for (const caminhoKey of caminhosParaCalcular) {
          const resultado = data.resultados[caminhoKey];
          if (resultado && resultado.total_portas !== undefined) {
            newTotals.set(caminhoKey, resultado.total_portas);
            // Armazenar também o total de CTOs
            newCTOsTotals.set(caminhoKey, resultado.total_ctos || 0);
            console.log(`✅ ${caminhoKey}: ${resultado.total_portas} portas (${resultado.total_ctos} CTOs)`);
          } else {
            console.warn(`⚠️ Sem resultado para ${caminhoKey}`);
            newTotals.set(caminhoKey, 0);
            newCTOsTotals.set(caminhoKey, 0);
          }
        }
        
        caminhoRedeTotals = newTotals;
        caminhoRedeCTOsTotals = newCTOsTotals;
        ultimosCaminhosCalculados = novosCaminhos;
        
        console.log(`✅ Batch completo! ${Object.keys(data.resultados).length} caminhos processados`);
        console.log(`📊 Map atualizado. Tamanho: ${caminhoRedeTotals.size}, Chaves:`, Array.from(caminhoRedeTotals.keys()));
      } else {
        console.error('❌ Resposta da API não tem success=true ou resultados:', data);
        throw new Error('Resposta inválida da API');
      }
    } catch (err) {
      console.error('❌ Erro ao buscar totais em batch:', err);
      // Em caso de erro, marcar todos como 0 para não ficar travado
      const newTotals = new Map(caminhoRedeTotals);
      const newCTOsTotals = new Map(caminhoRedeCTOsTotals);
      for (const caminhoKey of caminhosParaCalcular) {
        newTotals.set(caminhoKey, 0);
        newCTOsTotals.set(caminhoKey, 0);
      }
      caminhoRedeTotals = newTotals;
      caminhoRedeCTOsTotals = newCTOsTotals;
    } finally {
      // Marcar como concluído
      calculandoTotais = false;
      caminhosCarregando = false;
      caminhoRedeTotalsVersion++;
      await tick(); // Garantir atualização do DOM
    }
    
    console.log(`✅ Totais calculados para ${todosCaminhos.length} caminhos de rede`);
    console.log(`🔄 Versão final: ${caminhoRedeTotalsVersion}. Map final tem ${caminhoRedeTotals.size} entradas`);
  }
  
  // Função para obter total de portas do caminho de rede de uma CTO
  function getCaminhoRedeTotal(cto) {
    if (!cto || !caminhoRedeTotals) {
      console.warn('⚠️ getCaminhoRedeTotal: CTO ou Map inválido', { cto: !!cto, map: !!caminhoRedeTotals });
      return 0;
    }
    const caminhoKey = getCaminhoRedeKey(cto);
    const total = caminhoRedeTotals.get(caminhoKey) || 0;
    if (total === 0 && caminhoKey && !caminhoKey.includes('N/A')) {
      console.warn(`⚠️ getCaminhoRedeTotal: Total 0 para caminho "${caminhoKey}". Map tem ${caminhoRedeTotals.size} chaves:`, Array.from(caminhoRedeTotals.keys()));
    }
    return total;
  }
  
  // Função para obter total de CTOs do caminho de rede
  function getCaminhoRedeCTOsTotal(cto) {
    if (!cto || !caminhoRedeCTOsTotals) {
      console.warn('⚠️ getCaminhoRedeCTOsTotal: CTO ou Map inválido', { cto: !!cto, map: !!caminhoRedeCTOsTotals });
      return 0;
    }
    const caminhoKey = getCaminhoRedeKey(cto);
    const total = caminhoRedeCTOsTotals.get(caminhoKey) || 0;
    return total;
  }
  
  // Função para calcular o número de uma CTO na sequência (mesma lógica do mapa)
  // Retorna um Map com CTO como chave e número como valor
  function calculateCTONumbers() {
    const ctoToNumber = new Map();
    let markerNumber = 1;
    
    // Iterar pelas CTOs na mesma ordem que o displayResultsOnMap()
    for (const cto of ctos) {
      const ctoKey = getCTOKey(cto);
      const isVisible = ctoVisibility.get(ctoKey) !== false; // Padrão: true (visível)
      
      // Apenas numerar CTOs visíveis (mesma lógica do mapa)
      if (isVisible) {
        // Validar coordenadas
        if (cto.latitude && cto.longitude && !isNaN(cto.latitude) && !isNaN(cto.longitude)) {
          ctoToNumber.set(cto, markerNumber);
          markerNumber++;
        }
      }
    }
    
    return ctoToNumber;
  }
  
  // Map reativo para armazenar números das CTOs
  let ctoNumbers = new Map();
  let ctoNumbersVersion = 0; // Versão para forçar atualização
  
  // Recalcular números quando CTOs ou visibilidade mudarem
  $: if (ctos && ctos.length > 0) {
    // Forçar recálculo - ctoNumbersVersion será incrementado quando visibilidade mudar
    const _ = ctoNumbersVersion;
    ctoNumbers = calculateCTONumbers();
  } else {
    ctoNumbers = new Map();
  }
  
  // Variável reativa para forçar atualização quando os totais mudarem
  let caminhoRedeTotalsVersion = 0;
  
  // Recalcular quando a lista de CTOs mudar (com debounce para evitar loops)
  let timeoutId = null;
  $: if (ctos && ctos.length > 0) {
    // Cancelar timeout anterior se existir
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    
    // Aguardar um pouco antes de calcular para evitar múltiplas execuções
    timeoutId = setTimeout(async () => {
      try {
        // Verificar novamente se ainda há CTOs (pode ter mudado durante o timeout)
        if (ctos && ctos.length > 0 && !calculandoTotais) {
          console.log(`🔄 Iniciando cálculo de totais para ${ctos.length} CTOs`);
          await calculateCaminhoRedeTotals();
          console.log(`✅ Cálculo concluído. Versão: ${caminhoRedeTotalsVersion}, Map size: ${caminhoRedeTotals.size}`);
          await tick();
        }
      } catch (err) {
        console.error('❌ Erro ao calcular totais do caminho de rede:', err);
        calculandoTotais = false;
        caminhosCarregando = false;
      }
    }, 300); // Debounce de 300ms
  } else {
    // Limpar quando não há CTOs
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
    caminhoRedeTotals = new Map();
    caminhoRedeCTOsTotals = new Map();
    caminhoRedeLoading.clear();
    caminhoRedeTotalsVersion = 0;
    caminhosCarregando = false;
    calculandoTotais = false;
    ultimosCaminhosCalculados = new Set();
  }
  
  // Estados reativos para checkbox "marcar todos"
  $: allCTOsVisible = ctos.length > 0 && ctos.every(cto => {
    const ctoKey = getCTOKey(cto);
    return ctoVisibility.get(ctoKey) !== false;
  });
  
  $: someCTOsVisible = ctos.length > 0 && ctos.some(cto => {
    const ctoKey = getCTOKey(cto);
    return ctoVisibility.get(ctoKey) === true;
  }) && !allCTOsVisible;
  
  // Função para obter valor da célula para ordenação/filtro
  function getCellValue(cto, columnName) {
    switch(columnName) {
      case 'nome': return cto.nome || '';
      case 'cidade': return cto.cidade || '';
      case 'pop': return cto.pop || '';
      case 'chasse': return cto.olt || '';
      case 'placa': return cto.slot || '';
      case 'olt': return cto.pon || '';
      case 'id_cto': return cto.id_cto || cto.id || '';
      case 'portas_total': return parseFloat(cto.vagas_total || 0);
      case 'ocupadas': return parseFloat(cto.clientes_conectados || 0);
      case 'disponiveis': return parseFloat((cto.vagas_total || 0) - (cto.clientes_conectados || 0));
      case 'ocupacao': return parseFloat(cto.pct_ocup || 0);
      case 'status': return cto.status_cto || '';
      case 'total_portas_caminho': return getCaminhoRedeTotal(cto);
      case 'total_ctos_caminho': return getCaminhoRedeCTOsTotal(cto);
      default: return '';
    }
  }
  
  // Função para aplicar filtros
  function applyFilters(ctosList) {
    if (!filters || Object.keys(filters).length === 0) {
      return ctosList;
    }
    
    return ctosList.filter(cto => {
      for (const [columnName, filter] of Object.entries(filters)) {
        if (!filter || !filter.value) continue;
        
        const cellValue = getCellValue(cto, columnName);
        const filterValue = filter.value.toString().toLowerCase().trim();
        
        if (filter.type === 'text') {
          // Filtro de texto (contém)
          if (!cellValue.toString().toLowerCase().includes(filterValue)) {
            return false;
          }
        } else if (filter.type === 'number') {
          // Filtro numérico (maior/menor)
          const numValue = parseFloat(cellValue) || 0;
          const numFilter = parseFloat(filterValue) || 0;
          
          if (filter.operator === 'greater') {
            if (numValue <= numFilter) return false;
          } else if (filter.operator === 'less') {
            if (numValue >= numFilter) return false;
          } else if (filter.operator === 'equal') {
            if (numValue !== numFilter) return false;
          }
        } else if (filter.type === 'min') {
          // Filtro mínimo
          const numValue = parseFloat(cellValue) || 0;
          const numFilter = parseFloat(filterValue) || 0;
          if (numValue < numFilter) return false;
        }
      }
      return true;
    });
  }
  
  // Função para ordenar CTOs
  function sortCTOs(ctosList) {
    if (!sortColumn) {
      return ctosList;
    }
    
    const sorted = [...ctosList];
    sorted.sort((a, b) => {
      const aValue = getCellValue(a, sortColumn);
      const bValue = getCellValue(b, sortColumn);
      
      // Comparação numérica ou textual
      if (typeof aValue === 'number' && typeof bValue === 'number') {
        return sortDirection === 'asc' ? aValue - bValue : bValue - aValue;
      } else {
        const aStr = aValue.toString().toLowerCase();
        const bStr = bValue.toString().toLowerCase();
        if (sortDirection === 'asc') {
          return aStr.localeCompare(bStr, 'pt-BR');
        } else {
          return bStr.localeCompare(aStr, 'pt-BR');
        }
      }
    });
    
    return sorted;
  }
  
  // Aplicar filtros e ordenação quando necessário
  $: {
    if (ctos && ctos.length > 0) {
      let result = [...ctos];
      result = applyFilters(result);
      result = sortCTOs(result);
      filteredAndSortedCTOs = result;
    } else {
      filteredAndSortedCTOs = [];
    }
  }
  
  // Função para ordenar por coluna
  function handleSort(columnName) {
    if (sortColumn === columnName) {
      // Alternar direção se já está ordenando por essa coluna
      sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      // Nova coluna, começar com ascendente
      sortColumn = columnName;
      sortDirection = 'asc';
    }
  }
  
  // Função para aplicar filtro
  function applyFilter(columnName, filterType, value, operator = null) {
    if (!filters) filters = {};
    
    if (!value || value.toString().trim() === '') {
      // Remover filtro se vazio
      delete filters[columnName];
      filters = filters; // Forçar reatividade
    } else {
      filters[columnName] = {
        type: filterType,
        value: value,
        operator: operator
      };
      filters = filters; // Forçar reatividade
    }
    
    showFilterMenu = null; // Fechar menu
  }
  
  // Função para limpar todos os filtros
  function clearAllFilters() {
    filters = {};
    showFilterMenu = null;
  }
  
  // Função para alternar visibilidade de coluna
  function toggleColumnVisibility(columnName) {
    if (!columnVisibility) columnVisibility = {};
    columnVisibility[columnName] = !columnVisibility[columnName];
    columnVisibility = columnVisibility; // Forçar reatividade
  }
  
  // Inicializar visibilidade de todas as colunas como visível
  $: if (ctos.length > 0 && Object.keys(columnVisibility).length === 0) {
    columnVisibility = {
      checkbox: true,
      numero: true,
      nome: true,
      cidade: true,
      pop: true,
      chasse: true,
      placa: true,
      olt: true,
      id_cto: true,
      portas_total: true,
      ocupadas: true,
      disponiveis: true,
      ocupacao: true,
      status: true,
      total_portas_caminho: true,
      total_ctos_caminho: true
    };
  }
  
  // Redimensionamento de boxes - usar variáveis que o Svelte detecta como reativas
  let sidebarWidth = 400; // Largura inicial da sidebar em pixels (aumentada para melhor visibilidade)
  let mapHeightPixels = 400; // Altura inicial do mapa em pixels
  let isResizingSidebar = false;
  let isResizingMapTable = false;
  let resizeStartX = 0;
  let resizeStartY = 0;
  let resizeStartSidebarWidth = 0;
  let resizeStartMapHeight = 0;
  
  // Estados de minimização dos boxes
  let isSearchPanelMinimized = false;
  let isMapMinimized = false;
  let isTableMinimized = false;
  
  // Reactive statements para calcular estilos automaticamente
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
      // Adicionar 'marker' para suportar AdvancedMarkerElement
      const loader = new Loader({
        apiKey: GOOGLE_MAPS_API_KEY,
        version: 'weekly',
        libraries: ['places', 'geometry', 'marker'] // Adicionar 'marker' para AdvancedMarkerElement
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
      mapId: 'DEMO_MAP_ID', // Necessário para AdvancedMarkerElement
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
  
  // Array para armazenar círculos de raio de 250m das CTOs pesquisadas
  let radiusCircles = [];

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
    
    // Limpar círculos de raio de 250m
    radiusCircles.forEach(circle => {
      if (circle && circle.setMap) {
        circle.setMap(null);
      }
    });
    radiusCircles = [];
    
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
      // Usando AdvancedMarkerElement (API moderna recomendada pelo Google)
      if (map) {
        for (const { cto, lat, lng } of searchedCTOsList) {
          // Criar ícone personalizado usando PinElement
          const pinElement = new google.maps.marker.PinElement({
            background: '#4285F4', // Azul do Google Maps
            borderColor: '#FFFFFF',
            glyphColor: '#FFFFFF',
            scale: 1.2
          });
          
          const marker = new google.maps.marker.AdvancedMarkerElement({
            map: map,
            position: { lat, lng },
            title: `CTO pesquisada: ${cto.nome}`,
            content: pinElement.element,
            zIndex: 999
          });
          searchMarkers.push(marker);
          
          // Criar círculo de raio de 250m para cada CTO pesquisada (cor do projeto)
          const circle = new google.maps.Circle({
            strokeColor: '#7B68EE', // Cor da borda (roxo do projeto)
            strokeOpacity: 0.6, // Opacidade reduzida para evitar acúmulo visual
            strokeWeight: 2,
            fillColor: '#6495ED', // Cor de preenchimento (azul do projeto)
            fillOpacity: 0.08, // Opacidade reduzida para evitar acúmulo visual quando há múltiplos círculos
            map: map,
            center: { lat, lng },
            radius: 250, // Raio de 250 metros
            zIndex: 1 // Abaixo dos marcadores
          });
          radiusCircles.push(circle);
        }
        
        console.log(`✅ ${radiusCircles.length} círculo(s) de raio de 250m criado(s) para CTOs pesquisadas`);
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
      
      // Inicializar visibilidade de todas as CTOs como verdadeira (todas visíveis por padrão)
      ctoVisibility.clear();
      for (const cto of ctos) {
        const ctoKey = getCTOKey(cto);
        if (!ctoVisibility.has(ctoKey)) {
          ctoVisibility.set(ctoKey, true); // Todas visíveis por padrão
        }
      }
      ctoNumbersVersion++; // Forçar atualização da numeração

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

      // Os marcadores e círculos já foram criados acima
      // Limpar marcador único anterior se existir (compatibilidade)
      if (searchMarker) {
        searchMarker.setMap(null);
        searchMarker = null;
      }
      
      // Aguardar um pouco para garantir que o DOM está atualizado
      await tick();
      // Não chamar clearMap() aqui, pois já criamos os marcadores e círculos das CTOs pesquisadas
      // displayResultsOnMap() vai criar os marcadores das CTOs próximas, mas não deve limpar os círculos
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
    
    // Tentar detectar formato de coordenadas com múltiplos separadores:
    // - "lat, lng" ou "lat,lng" (vírgula)
    // - "lat; lng" ou "lat;lng" (ponto e vírgula)
    // - "lat lng" (espaço) - NOVO!
    // Suporta números decimais com ponto ou vírgula
    // Padrão: número opcionalmente com decimais, separador (vírgula/ponto e vírgula/espaço), número opcionalmente com decimais
    const coordPatternWithComma = /^-?\d+([.,]\d+)?\s*[,;]\s*-?\d+([.,]\d+)?$/;
    const coordPatternWithSpace = /^-?\d+([.,]\d+)?\s+-?\d+([.,]\d+)?$/;
    
    // Tentar primeiro com vírgula ou ponto e vírgula
    if (coordPatternWithComma.test(trimmed)) {
      // Dividir pela primeira vírgula ou ponto e vírgula encontrada (separador entre lat e lng)
      const separatorIndex = trimmed.search(/[,;]/);
      if (separatorIndex > 0) {
        const latStr = trimmed.substring(0, separatorIndex).trim().replace(',', '.');
        const lngStr = trimmed.substring(separatorIndex + 1).trim().replace(',', '.');
        
        const lat = parseFloat(latStr);
        const lng = parseFloat(lngStr);
        
        // Validar se são coordenadas válidas
        if (!isNaN(lat) && !isNaN(lng) && 
            lat >= -90 && lat <= 90 && 
            lng >= -180 && lng <= 180) {
          console.log(`✅ Coordenadas parseadas (com vírgula): "${trimmed}" → lat: ${lat}, lng: ${lng}`);
          return { isCoordinates: true, lat, lng };
        } else {
          console.warn(`⚠️ Coordenadas inválidas: "${trimmed}" → lat: ${lat}, lng: ${lng}`);
        }
      }
    }
    // Tentar com espaço como separador
    else if (coordPatternWithSpace.test(trimmed)) {
      // Dividir por espaço (um ou mais espaços)
      const parts = trimmed.split(/\s+/).filter(p => p.length > 0);
      if (parts.length >= 2) {
        // Pegar os dois primeiros números (lat e lng)
        const latStr = parts[0].replace(',', '.');
        const lngStr = parts[1].replace(',', '.');
        
        const lat = parseFloat(latStr);
        const lng = parseFloat(lngStr);
        
        // Validar se são coordenadas válidas
        if (!isNaN(lat) && !isNaN(lng) && 
            lat >= -90 && lat <= 90 && 
            lng >= -180 && lng <= 180) {
          console.log(`✅ Coordenadas parseadas (com espaço): "${trimmed}" → lat: ${lat}, lng: ${lng}`);
          return { isCoordinates: true, lat, lng };
        } else {
          console.warn(`⚠️ Coordenadas inválidas (espaço): "${trimmed}" → lat: ${lat}, lng: ${lng}`);
        }
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

      // Separar múltiplos endereços/coordenadas de forma inteligente
      // Estratégia: primeiro dividir por separadores seguros (quebra de linha, ponto e vírgula)
      // Depois, para cada linha, verificar se é uma coordenada completa
      let addressesInputs = [];
      
      // Dividir por quebra de linha ou ponto e vírgula primeiro (separadores seguros)
      const lines = enderecoInput.split(/[;\n]/).map(line => line.trim()).filter(line => line.length > 0);
      
      // Se não encontrou separadores seguros, tratar o input inteiro como uma única entrada
      if (lines.length === 0) {
        lines.push(enderecoInput.trim());
      }
      
      for (const line of lines) {
        // Verificar se a linha inteira é uma coordenada válida
        const parsed = parseCoordinatesOrAddress(line);
        if (parsed.isCoordinates) {
          // É uma coordenada completa, adicionar como está
          addressesInputs.push(line);
          console.log(`✅ Linha identificada como coordenada: "${line}"`);
        } else {
          // Não é coordenada completa, pode ser:
          // 1. Um endereço textual
          // 2. Múltiplas coordenadas na mesma linha separadas por vírgula ou espaço
          // Tentar detectar se são múltiplas coordenadas (padrão: números, vírgulas, pontos, espaços, hífens)
          if (/^[\d\s,.-]+$/.test(line)) {
            let parts = [];
            let hasComma = line.includes(',');
            
            if (hasComma) {
              // Dividir por vírgula
              parts = line.split(',').map(p => p.trim()).filter(p => p.length > 0);
            } else {
              // Dividir por espaço (um ou mais espaços)
              parts = line.split(/\s+/).filter(p => p.length > 0);
            }
            
            if (parts.length >= 2 && parts.length % 2 === 0) {
              // Número par de partes, agrupar em pares (lat, lng)
              let allValid = true;
              const validPairs = [];
              
              for (let i = 0; i < parts.length; i += 2) {
                // Criar par usando o separador original (vírgula ou espaço)
                const coordPair = hasComma 
                  ? `${parts[i]},${parts[i + 1]}`
                  : `${parts[i]} ${parts[i + 1]}`;
                
                // Verificar se o par é uma coordenada válida
                const pairParsed = parseCoordinatesOrAddress(coordPair);
                if (pairParsed.isCoordinates) {
                  validPairs.push(coordPair);
                  console.log(`✅ Par de coordenadas identificado: "${coordPair}"`);
                } else {
                  // Par inválido
                  allValid = false;
                  console.log(`⚠️ Par inválido: "${coordPair}"`);
                  break; // Parar de processar pares
                }
              }
              
              if (allValid && validPairs.length > 0) {
                // Todos os pares são válidos, adicionar todos
                addressesInputs.push(...validPairs);
                console.log(`✅ ${validPairs.length} par(es) de coordenadas identificado(s)`);
              } else {
                // Algum par inválido, tratar como endereço
                addressesInputs.push(line);
                console.log(`⚠️ Algum par inválido, tratando linha inteira como endereço: "${line}"`);
              }
            } else {
              // Número ímpar de partes ou formato inválido, tratar como endereço único
              addressesInputs.push(line);
              console.log(`ℹ️ Linha tratada como endereço (número ímpar de partes): "${line}"`);
            }
          } else {
            // Parece ser um endereço textual, adicionar como está
            addressesInputs.push(line);
            console.log(`ℹ️ Linha tratada como endereço textual: "${line}"`);
          }
        }
      }

      if (addressesInputs.length === 0) {
        error = 'Por favor, insira pelo menos um endereço ou coordenadas';
        loadingCTOs = false;
        return;
      }
      
      console.log(`📋 Total de entradas processadas: ${addressesInputs.length}`, addressesInputs);

      console.log(`🔍 Buscando ${addressesInputs.length} endereço(s)/coordenada(s):`, addressesInputs);

      // Processar cada endereço/coordenada em paralelo
      const searchPromises = addressesInputs.map(async (input) => {
        try {
          const parsed = parseCoordinatesOrAddress(input);
          let lat, lng;
          let title;

          if (parsed.isCoordinates) {
            // É coordenadas - usar diretamente
            lat = parsed.lat;
            lng = parsed.lng;
            title = `Coordenadas: ${lat.toFixed(6)}, ${lng.toFixed(6)}`;
            console.log(`✅ Coordenadas detectadas: ${lat}, ${lng}`);
          } else {
            // É endereço - geocodificar (precisa do Google Maps carregado)
            if (!googleMapsLoaded || !google.maps || !google.maps.Geocoder) {
              throw new Error('Google Maps não está carregado. Aguarde alguns instantes e tente novamente.');
            }
            const result = await geocodeAddress(parsed.address);
            const location = result.geometry.location;
            lat = location.lat();
            lng = location.lng();
            title = `Endereço: ${parsed.address}`;
            console.log(`✅ Endereço geocodificado: ${parsed.address} → ${lat}, ${lng}`);
          }

          return { lat, lng, title, input };
        } catch (err) {
          console.error(`❌ Erro ao processar "${input}":`, err);
          return null;
        }
      });

      const searchResults = await Promise.all(searchPromises);
      const validPoints = searchResults.filter(result => result !== null);

      if (validPoints.length === 0) {
        error = 'Nenhum endereço ou coordenada válida encontrada. Verifique os valores digitados.';
        loadingCTOs = false;
        return;
      }

      console.log(`✅ ${validPoints.length} ponto(s) válido(s) encontrado(s)`);

      // Criar marcadores e círculos para cada ponto pesquisado
      // Usando AdvancedMarkerElement (API moderna recomendada pelo Google)
      if (map) {
        for (const { lat, lng, title } of validPoints) {
          // Marcador azul para o ponto pesquisado
          // Criar ícone personalizado usando PinElement
          const pinElement = new google.maps.marker.PinElement({
            background: '#4285F4', // Azul do Google Maps
            borderColor: '#FFFFFF',
            glyphColor: '#FFFFFF',
            scale: 1.2
          });
          
          const marker = new google.maps.marker.AdvancedMarkerElement({
            map: map,
            position: { lat, lng },
            title: title,
            content: pinElement.element,
            zIndex: 999
          });
          searchMarkers.push(marker);
          
          // Criar círculo de raio de 250m para cada ponto pesquisado (cor do projeto)
          const circle = new google.maps.Circle({
            strokeColor: '#7B68EE', // Cor da borda (roxo do projeto)
            strokeOpacity: 0.6, // Opacidade reduzida para evitar acúmulo visual
            strokeWeight: 2,
            fillColor: '#6495ED', // Cor de preenchimento (azul do projeto)
            fillOpacity: 0.08, // Opacidade reduzida para evitar acúmulo visual quando há múltiplos círculos
            map: map,
            center: { lat, lng },
            radius: 250, // Raio de 250 metros
            zIndex: 1 // Abaixo dos marcadores
          });
          radiusCircles.push(circle);
        }
        
        console.log(`✅ ${radiusCircles.length} círculo(s) de raio de 250m criado(s) para pontos pesquisados`);
      }

      // Buscar CTOs próximas de cada ponto (em paralelo)
      const nearbyPromises = validPoints.map(({ lat, lng }) =>
        fetch(getApiUrl(`/api/ctos/nearby?lat=${lat}&lng=${lng}&radius=250`))
          .then(response => response.json())
          .then(data => ({ data, lat, lng }))
          .catch(err => {
            console.error(`Erro ao buscar CTOs próximas de ${lat}, ${lng}:`, err);
            return { data: null, lat, lng };
          })
      );

      const nearbyResults = await Promise.all(nearbyPromises);

      // Consolidar todas as CTOs encontradas (evitando duplicatas por coordenadas)
      const allCTOsMap = new Map(); // Chave: coordenadas para evitar duplicatas
      
      for (const { data, lat, lng } of nearbyResults) {
        if (data?.success && data.ctos) {
          // Filtrar apenas CTOs dentro de 250m (garantir precisão)
          const nearbyCTOs = data.ctos.filter(cto => {
            if (!cto.latitude || !cto.longitude) return false;
            const distance = calculateDistance(lat, lng, parseFloat(cto.latitude), parseFloat(cto.longitude));
            return distance <= 250;
          });

          // Adicionar CTOs ao Map (evitando duplicatas)
          for (const cto of nearbyCTOs) {
            const ctoKey = `${parseFloat(cto.latitude).toFixed(6)},${parseFloat(cto.longitude).toFixed(6)}`;
            if (!allCTOsMap.has(ctoKey)) {
              allCTOsMap.set(ctoKey, cto);
            }
          }
        }
      }

      // Converter Map para array
      ctos = Array.from(allCTOsMap.values());

      console.log(`📍 Busca por endereço/coordenadas: ${ctos.length} CTOs únicas encontradas dentro de 250m`);

      // Inicializar visibilidade de todas as CTOs como verdadeira (todas visíveis por padrão)
      ctoVisibility.clear();
      for (const cto of ctos) {
        const ctoKey = getCTOKey(cto);
        if (!ctoVisibility.has(ctoKey)) {
          ctoVisibility.set(ctoKey, true); // Todas visíveis por padrão
        }
      }
      ctoNumbersVersion++; // Forçar atualização da numeração

      if (ctos.length === 0) {
        error = 'Nenhuma CTO encontrada dentro de 250m dos pontos pesquisados.';
        loadingCTOs = false;
        return;
      }

      // Limpar marcador único anterior se existir (compatibilidade)
      if (searchMarker) {
        searchMarker.setMap(null);
        searchMarker = null;
      }
      
      // Aguardar um pouco para garantir que o DOM está atualizado
      await tick();
      // Exibir CTOs no mapa (isso vai ajustar o zoom automaticamente)
      await displayResultsOnMap();
      
      // Se não houver CTOs, centralizar no primeiro ponto pesquisado
      if (ctos.length === 0 && map && validPoints.length > 0) {
        const firstPoint = validPoints[0];
        map.setCenter({ lat: firstPoint.lat, lng: firstPoint.lng });
        map.setZoom(15);
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

    // Limpar apenas marcadores das CTOs (mantendo círculos e marcadores de busca)
    // Os círculos e marcadores de busca das CTOs pesquisadas devem ser preservados
    markers.forEach(marker => {
      if (marker && marker.setMap) {
        marker.setMap(null);
      }
    });
    markers = [];

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

    // ETAPA 1: Agrupar CTOs por coordenadas (lat/lng idênticas) e filtrar apenas as visíveis
    const ctosByPosition = new Map(); // Chave: "lat,lng", Valor: Array de CTOs + números
    const ctoToNumber = new Map(); // Mapear CTO para seu número no array
    
    for (let i = 0; i < ctos.length; i++) {
      const cto = ctos[i];
      
      // Verificar se a CTO está marcada como visível
      const ctoKey = getCTOKey(cto);
      const isVisible = ctoVisibility.get(ctoKey) !== false; // Padrão: true (visível)
      
      if (!isVisible) {
        // CTO não está marcada como visível, pular
        markersSkipped++;
        continue;
      }
      
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

      try {
        // Criar marcador único para este grupo usando AdvancedMarkerElement
        // Criar elemento HTML customizado para replicar o círculo colorido com label
        const markerElement = document.createElement('div');
        markerElement.style.width = '36px';
        markerElement.style.height = '36px';
        markerElement.style.borderRadius = '50%';
        markerElement.style.backgroundColor = ctoColor;
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
        markerElement.textContent = labelText;
        markerElement.title = `${groupCTOs.length} CTO(s) neste ponto: ${groupCTOs.map(cto => cto.nome).join(', ')}`;
        
        const marker = new google.maps.marker.AdvancedMarkerElement({
          map: map,
          position: position,
          title: `${groupCTOs.length} CTO(s) neste ponto: ${groupCTOs.map(cto => cto.nome).join(', ')}`,
          content: markerElement,
          zIndex: 1000 + numbers[0]
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
              <strong>CHASSE:</strong> ${String(cto.olt || 'N/A')}<br>
              <strong>PLACA:</strong> ${String(cto.slot || 'N/A')}<br>
              <strong>OLT:</strong> ${String(cto.pon || 'N/A')}<br>
              <strong>ID CTO:</strong> ${String(cto.id_cto || cto.id || 'N/A')}<br>
              <strong>Status:</strong> <span style="color: ${isAtiva ? '#28A745' : '#DC3545'}; font-weight: bold;">${String(statusCto || 'N/A')}</span><br>
              <strong>Total de Portas:</strong> ${Number(cto.vagas_total || 0)}<br>
              <strong>Portas Conectadas:</strong> ${Number(cto.clientes_conectados || 0)}<br>
              <strong>Portas Disponíveis:</strong> ${Number((cto.vagas_total || 0) - (cto.clientes_conectados || 0))}<br>
              <strong>Ocupação:</strong> ${pctOcup.toFixed(1)}%<br>
              <strong>Total de Portas no Caminho de Rede:</strong> ${getCaminhoRedeTotal(cto)} (${String(cto.olt || 'N/A')} / ${String(cto.slot || 'N/A')} / ${String(cto.pon || 'N/A')})
            </div>
          `;
        }
        
        infoWindowContent += '</div>';

        const infoWindow = new google.maps.InfoWindow({
          content: infoWindowContent
        });

        // Event listener para AdvancedMarkerElement
        // AdvancedMarkerElement usa addEventListener diretamente no elemento DOM
        markerElement.addEventListener('click', () => {
          infoWindow.open({
            anchor: marker,
            map: map
          });
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
    console.log('🖱️ Iniciando redimensionamento da sidebar', e);
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
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
    
    // Se o painel estiver minimizado, não permitir redimensionamento manual
    if (isSearchPanelMinimized) return;
    
    const clientX = e.clientX || e.touches?.[0]?.clientX || resizeStartX;
    const deltaX = clientX - resizeStartX;
    const newWidth = resizeStartSidebarWidth + deltaX;
    // Limites: mínimo 300px, máximo 700px (ajustado para corresponder ao CSS)
    const clampedWidth = Math.max(300, Math.min(700, newWidth));
    
    // Atualizar diretamente - Svelte detecta automaticamente
    sidebarWidth = clampedWidth;
    
    // Forçar atualização do DOM diretamente também
    const sidebarElement = document.querySelector('.search-panel');
    if (sidebarElement) {
      sidebarElement.style.width = `${clampedWidth}px`;
      sidebarElement.style.flex = '0 0 auto';
    }
    
    console.log(`📏 Arrastando sidebar: ${clampedWidth}px`);
    
    // Salvar no localStorage (sem await para não bloquear)
    try {
      localStorage.setItem('analiseCobertura_sidebarWidth', clampedWidth.toString());
    } catch (err) {
      console.warn('Erro ao salvar largura da sidebar:', err);
    }
  }

  function stopResizeSidebar() {
    console.log('✅ Parando redimensionamento da sidebar');
    isResizingSidebar = false;
    document.removeEventListener('mousemove', handleResizeSidebar, { capture: true });
    document.removeEventListener('mouseup', stopResizeSidebar, { capture: true });
    document.removeEventListener('touchmove', handleResizeSidebar, { capture: true });
    document.removeEventListener('touchend', stopResizeSidebar, { capture: true });
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }

  function startResizeMapTable(e) {
    console.log('🖱️ Iniciando redimensionamento mapa/tabela', e);
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    isResizingMapTable = true;
    resizeStartY = e.clientY || e.touches?.[0]?.clientY || 0;
    resizeStartMapHeight = mapHeightPixels; // Usar pixels ao invés de percent
    document.addEventListener('mousemove', handleResizeMapTable, { passive: false, capture: true });
    document.addEventListener('mouseup', stopResizeMapTable, { passive: false, capture: true });
    document.addEventListener('touchmove', handleResizeMapTable, { passive: false, capture: true });
    document.addEventListener('touchend', stopResizeMapTable, { passive: false, capture: true });
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
    return false;
  }

  function handleResizeMapTable(e) {
    if (!isResizingMapTable) return;
    e.preventDefault();
    e.stopPropagation();
    
    const clientY = e.clientY || e.touches?.[0]?.clientY || resizeStartY;
    const deltaY = clientY - resizeStartY;
    const newHeight = resizeStartMapHeight + deltaY; // Usar pixels diretamente
    
    // Limites: mínimo 300px, máximo baseado no container
    const container = document.querySelector('.main-area');
    const containerHeight = container ? container.getBoundingClientRect().height : 800;
    
    // Se a tabela estiver minimizada, permitir que o mapa ocupe quase todo o espaço
    // Deixar apenas espaço para a tabela minimizada (~70px) + handle (~20px) + pequena margem
    const minSpaceForTable = isTableMinimized ? 90 : 200; // 90px quando minimizada, 200px quando expandida
    const maxHeight = Math.max(containerHeight - minSpaceForTable, 300);
    const clampedHeight = Math.max(300, Math.min(maxHeight, newHeight));
    
    // Atualizar diretamente - Svelte detecta automaticamente
    mapHeightPixels = clampedHeight;
    
    // Forçar atualização do DOM diretamente também
    const mapElement = document.querySelector('.map-container');
    const tableElement = document.querySelector('.results-table-container, .empty-state');
    if (mapElement) {
      // Respeitar o estado minimizado do mapa ao redimensionar
      if (isMapMinimized) {
        // Se o mapa está minimizado, manter altura minimizada
        mapElement.style.height = '60px';
        mapElement.style.flex = '0 0 auto';
        mapElement.style.minHeight = '60px';
      } else {
        // Se o mapa está expandido, aplicar altura calculada
        mapElement.style.height = `${clampedHeight}px`;
        mapElement.style.flex = '0 0 auto';
        mapElement.style.minHeight = `${clampedHeight}px`;
      }
    }
    if (tableElement) {
      // Respeitar o estado minimizado da tabela ao redimensionar
      if (isTableMinimized) {
        // Se a tabela está minimizada, manter estilos minimizados
        tableElement.style.flex = '0 0 auto';
        tableElement.style.minHeight = '60px';
      } else {
        // Se a tabela está expandida, ocupar o resto do espaço
        tableElement.style.flex = '1 1 auto';
        tableElement.style.minHeight = '200px';
      }
    }
    
    console.log(`📏 Arrastando mapa/tabela: Mapa ${clampedHeight}px`);
    
    // Salvar no localStorage (sem await para não bloquear)
    try {
      localStorage.setItem('analiseCobertura_mapHeightPixels', clampedHeight.toString());
    } catch (err) {
      console.warn('Erro ao salvar altura do mapa:', err);
    }
  }

  function stopResizeMapTable() {
    console.log('✅ Parando redimensionamento mapa/tabela');
    isResizingMapTable = false;
    document.removeEventListener('mousemove', handleResizeMapTable, { capture: true });
    document.removeEventListener('mouseup', stopResizeMapTable, { capture: true });
    document.removeEventListener('touchmove', handleResizeMapTable, { capture: true });
    document.removeEventListener('touchend', stopResizeMapTable, { capture: true });
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
      
      const savedMapHeight = localStorage.getItem('analiseCobertura_mapHeightPixels');
      if (savedMapHeight) {
        mapHeightPixels = parseInt(savedMapHeight, 10);
        if (isNaN(mapHeightPixels) || mapHeightPixels < 300 || mapHeightPixels > 1000) {
          mapHeightPixels = 400; // Valor padrão em pixels
        }
      }
    } catch (err) {
      console.warn('Erro ao carregar preferências de redimensionamento:', err);
    }
  }


  // Função para limitar seleção de texto a uma única célula
  let selectionHandler = null;
  let mouseDownCell = null;
  
  function limitSelectionToSingleCell() {
    const table = document.querySelector('.results-table');
    if (!table) return;
    
    // Remover listeners anteriores se existirem
    if (selectionHandler) {
      table.removeEventListener('mousedown', selectionHandler.mousedown);
      table.removeEventListener('mouseup', selectionHandler.mouseup);
      table.removeEventListener('selectstart', selectionHandler.selectstart);
    }
    
    // Criar novos handlers
    selectionHandler = {
      mousedown: (e) => {
        // Encontrar a célula onde o mouse foi pressionado
        let target = e.target;
        while (target && target.tagName !== 'TD' && target.tagName !== 'TH') {
          target = target.parentNode;
        }
        mouseDownCell = target;
      },
      
      mouseup: (e) => {
        // Aguardar um pouco para permitir que a seleção seja completada
        setTimeout(() => {
          const selection = window.getSelection();
          if (!selection || selection.rangeCount === 0) {
            mouseDownCell = null;
            return;
          }
          
          const range = selection.getRangeAt(0);
          if (!range) {
            mouseDownCell = null;
            return;
          }
          
          // Encontrar células que contêm o início e fim da seleção
          let startCell = range.startContainer;
          let endCell = range.endContainer;
          
          // Função auxiliar para encontrar célula pai
          const findParentCell = (node) => {
            while (node && node.nodeType !== 1) {
              node = node.parentNode;
            }
            while (node && node.tagName !== 'TD' && node.tagName !== 'TH') {
              node = node.parentNode;
            }
            return node;
          };
          
          // Função auxiliar para obter o índice da coluna de uma célula
          const getCellColumnIndex = (cell) => {
            if (!cell) return -1;
            const row = cell.parentNode;
            if (!row) return -1;
            const cells = Array.from(row.children);
            return cells.indexOf(cell);
          };
          
          startCell = findParentCell(startCell);
          endCell = findParentCell(endCell);
          
          // Se a seleção cruza múltiplas células
          if (startCell && endCell && startCell !== endCell) {
            const startColIndex = getCellColumnIndex(startCell);
            const endColIndex = getCellColumnIndex(endCell);
            
            // Se estão na mesma coluna, extrair apenas os valores dessa coluna
            if (startColIndex === endColIndex && startColIndex !== -1) {
              // Extrair apenas o conteúdo da coluna selecionada
              const startRow = startCell.parentNode;
              const endRow = endCell.parentNode;
              const rows = Array.from(table.querySelectorAll('tbody tr'));
              const startRowIndex = rows.indexOf(startRow);
              const endRowIndex = rows.indexOf(endRow);
              
              if (startRowIndex !== -1 && endRowIndex !== -1) {
                // Extrair apenas os valores da coluna selecionada
                const columnValues = [];
                const minRow = Math.min(startRowIndex, endRowIndex);
                const maxRow = Math.max(startRowIndex, endRowIndex);
                
                for (let i = minRow; i <= maxRow; i++) {
                  const row = rows[i];
                  if (row) {
                    const cells = Array.from(row.querySelectorAll('td'));
                    if (cells[startColIndex]) {
                      // Ignorar células de checkbox (primeira coluna)
                      // Ignorar células de número (#) se for a segunda coluna
                      const cellText = cells[startColIndex].textContent.trim();
                      if (cellText && !cellText.match(/^\d+$/)) {
                        columnValues.push(cellText);
                      } else if (cellText) {
                        // Se for número, verificar se não é checkbox ou #
                        columnValues.push(cellText);
                      }
                    }
                  }
                }
                
                // Armazenar os valores da coluna para uso no evento copy
                if (columnValues.length > 0) {
                  table.setAttribute('data-selected-column', JSON.stringify({
                    values: columnValues,
                    colIndex: startColIndex
                  }));
                  
                  console.log('✅ Coluna selecionada - valores armazenados:', columnValues);
                  // Não copiar aqui, apenas armazenar para o evento 'copy' usar
                  mouseDownCell = null;
                  return;
                }
              }
            } else {
              // Se não estão na mesma coluna, limitar a apenas uma célula
              const targetCell = mouseDownCell || startCell;
              
              if (targetCell) {
                // Limpar seleção atual
                selection.removeAllRanges();
                
                // Selecionar apenas o conteúdo da célula alvo
                const newRange = document.createRange();
                newRange.selectNodeContents(targetCell);
                selection.addRange(newRange);
                
                console.log('✅ Seleção limitada à célula:', targetCell.textContent.trim());
              }
            }
          } else if (mouseDownCell && startCell && startCell !== mouseDownCell) {
            // Se apenas uma célula foi selecionada mas diferente da inicial
            if (mouseDownCell) {
              selection.removeAllRanges();
              const newRange = document.createRange();
              newRange.selectNodeContents(mouseDownCell);
              selection.addRange(newRange);
            }
          }
          
          mouseDownCell = null;
        }, 50); // Aumentar timeout para garantir que a seleção seja capturada
      },
      
      selectstart: (e) => {
        // Se o usuário começar a selecionar, verificar se está dentro de uma célula
        let target = e.target;
        while (target && target.tagName !== 'TD' && target.tagName !== 'TH' && target !== table) {
          target = target.parentNode;
        }
        
        // Se não estiver em uma célula, permitir seleção normal
        if (!target || target === table) return;
        
        // Armazenar a célula inicial
        mouseDownCell = target;
        console.log('📍 Seleção iniciada na célula:', target.textContent.trim());
      }
    };
    
    // Adicionar listeners
    table.addEventListener('mousedown', selectionHandler.mousedown, true);
    table.addEventListener('mouseup', selectionHandler.mouseup, true);
    table.addEventListener('selectstart', selectionHandler.selectstart, true);
    
    // Interceptar evento de cópia para garantir que apenas a coluna seja copiada
    table.addEventListener('copy', (e) => {
      // Verificar se há uma coluna selecionada armazenada
      const selectedColumnData = table.getAttribute('data-selected-column');
      
      if (selectedColumnData) {
        try {
          const columnInfo = JSON.parse(selectedColumnData);
          
          if (columnInfo.values && columnInfo.values.length > 0) {
            // Prevenir comportamento padrão
            e.preventDefault();
            
            // Substituir o clipboard apenas com os valores da coluna
            const columnText = columnInfo.values.join('\n');
            e.clipboardData.setData('text/plain', columnText);
            
            console.log('✅ Clipboard interceptado - apenas coluna:', columnInfo.values);
            
            // Limpar o atributo após usar
            table.removeAttribute('data-selected-column');
            return;
          }
        } catch (err) {
          console.error('Erro ao processar dados da coluna:', err);
        }
      }
      
      // Se não há coluna selecionada armazenada, tentar detectar agora
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) return;
      
      const range = selection.getRangeAt(0);
      if (!range) return;
      
      let startCell = range.startContainer;
      let endCell = range.endContainer;
      
      const findParentCell = (node) => {
        while (node && node.nodeType !== 1) {
          node = node.parentNode;
        }
        while (node && node.tagName !== 'TD' && node.tagName !== 'TH') {
          node = node.parentNode;
        }
        return node;
      };
      
      const getCellColumnIndex = (cell) => {
        if (!cell) return -1;
        const row = cell.parentNode;
        if (!row) return -1;
        const cells = Array.from(row.children);
        return cells.indexOf(cell);
      };
      
      startCell = findParentCell(startCell);
      endCell = findParentCell(endCell);
      
      // Se está selecionando múltiplas células na mesma coluna
      if (startCell && endCell && startCell !== endCell) {
        const startColIndex = getCellColumnIndex(startCell);
        const endColIndex = getCellColumnIndex(endCell);
        
        if (startColIndex === endColIndex && startColIndex !== -1) {
          const startRow = startCell.parentNode;
          const endRow = endCell.parentNode;
          const rows = Array.from(table.querySelectorAll('tbody tr'));
          const startRowIndex = rows.indexOf(startRow);
          const endRowIndex = rows.indexOf(endRow);
          
          if (startRowIndex !== -1 && endRowIndex !== -1) {
            const columnValues = [];
            const minRow = Math.min(startRowIndex, endRowIndex);
            const maxRow = Math.max(startRowIndex, endRowIndex);
            
            for (let i = minRow; i <= maxRow; i++) {
              const row = rows[i];
              if (row) {
                const cells = Array.from(row.querySelectorAll('td'));
                if (cells[startColIndex]) {
                  const cellText = cells[startColIndex].textContent.trim();
                  if (cellText) {
                    columnValues.push(cellText);
                  }
                }
              }
            }
            
            if (columnValues.length > 0) {
              e.preventDefault();
              e.clipboardData.setData('text/plain', columnValues.join('\n'));
              console.log('✅ Clipboard interceptado (detecção no copy) - apenas coluna:', columnValues);
              return;
            }
          }
        }
      }
      
      // Se chegou aqui, a seleção cruza múltiplas colunas - limpar
      table.removeAttribute('data-selected-column');
    }, true);
  }

  // Inicializar ferramenta
  onMount(async () => {
    try {
      // Garantir que mapa e tabela estejam visíveis ao carregar
      isMapMinimized = false;
      isTableMinimized = false;
      
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
      
      // Aguardar a tabela estar disponível antes de adicionar o listener
      await tick();
      setTimeout(() => {
        limitSelectionToSingleCell();
      }, 500);
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
    
    // Limpar handler de seleção se existir
    if (selectionHandler) {
      const table = document.querySelector('.results-table');
      if (table && selectionHandler) {
        table.removeEventListener('mousedown', selectionHandler.mousedown, true);
        table.removeEventListener('mouseup', selectionHandler.mouseup, true);
        table.removeEventListener('selectstart', selectionHandler.selectstart, true);
      }
      selectionHandler = null;
    }
  });
</script>

<!-- Conteúdo da Ferramenta de Consulta de Alívio de Rede -->
<div class="analise-cobertura-content">
  {#if isLoading}
    <Loading message={loadingMessage} />
  {:else}
    <div class="main-layout">
      <!-- Painel de Busca -->
      <aside class="search-panel" class:minimized={isSearchPanelMinimized} style="width: {isSearchPanelMinimized ? '60px' : sidebarWidthStyle} !important; flex: 0 0 auto;">
        <div class="panel-header">
          <div class="panel-header-content">
            {#if !isSearchPanelMinimized}
              <h2>Consulta de Alívio de Rede</h2>
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
            <p>Busque CTOs na base de dados</p>
          {/if}
        </div>

        {#if !isSearchPanelMinimized}
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
                placeholder="Insira uma ou mais CTOs"
                rows="3"
                on:keydown={(e) => e.key === 'Enter' && !e.shiftKey && handleSearch()}
              ></textarea>
            </div>
          {:else if searchMode === 'endereco'}
            <div class="form-group">
              <label for="endereco">Endereço ou Coordenadas</label>
              <textarea 
                id="endereco"
                bind:value={enderecoInput}
                placeholder="Insira um ou mais endereços"
                rows="3"
                on:keydown={(e) => e.key === 'Enter' && !e.shiftKey && handleSearch()}
              ></textarea>
            </div>
          {/if}

          <button class="search-button" on:click={handleSearch} disabled={loadingCTOs}>
            {#if loadingCTOs}
              ⏳ Buscando...
            {:else}
              Buscar
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
                  // Quando expandir, aguardar renderização e fazer resize do mapa
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
              <h3>Resultados ({filteredAndSortedCTOs.length}{Object.keys(filters).length > 0 ? ` de ${ctos.length}` : ''})</h3>
              {#if Object.keys(filters).length > 0}
                <button class="clear-filters-button" on:click={clearAllFilters} title="Limpar todos os filtros">
                  🗑️ Limpar Filtros
                </button>
              {/if}
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
                    <th>
                      <input 
                        type="checkbox" 
                        checked={allCTOsVisible}
                        indeterminate={someCTOsVisible}
                        on:change={(e) => {
                          const isChecked = e.target.checked;
                          const newVisibility = new Map();
                          for (const cto of ctos) {
                            const ctoKey = getCTOKey(cto);
                            newVisibility.set(ctoKey, isChecked);
                          }
                          ctoVisibility = newVisibility;
                          ctoNumbersVersion++; // Forçar atualização da numeração
                          displayResultsOnMap();
                        }}
                      />
                    </th>
                    <th class="sortable-header" class:hidden={columnVisibility.numero === false}>
                      <div class="header-content">
                        <span>#</span>
                        <div class="header-controls">
                          <button class="sort-button" on:click={() => handleSort('numero')} title="Ordenar">
                            {#if sortColumn === 'numero'}
                              {sortDirection === 'asc' ? '↑' : '↓'}
                            {:else}
                              ⇅
                            {/if}
                          </button>
                          <button class="filter-button" on:click={() => showFilterMenu = showFilterMenu === 'numero' ? null : 'numero'} title="Filtrar">
                            {filters.numero ? '🔍' : '⚙️'}
                          </button>
                          <button class="toggle-column-button" on:click={() => toggleColumnVisibility('numero')} title="Ocultar coluna">
                            👁️
                          </button>
                        </div>
                      </div>
                      {#if showFilterMenu === 'numero'}
                        <div class="filter-menu">
                          <input type="number" placeholder="Filtrar por número" bind:value={filters.numero?.value || ''} on:input={(e) => applyFilter('numero', 'number', e.target.value, 'equal')} />
                          <button on:click={() => showFilterMenu = null}>Fechar</button>
                        </div>
                      {/if}
                    </th>
                    <th class="sortable-header" class:hidden={columnVisibility.nome === false}>
                      <div class="header-content">
                        <span>CTO</span>
                        <div class="header-controls">
                          <button class="sort-button" on:click={() => handleSort('nome')} title="Ordenar A-Z / Z-A">
                            {#if sortColumn === 'nome'}
                              {sortDirection === 'asc' ? '↑' : '↓'}
                            {:else}
                              ⇅
                            {/if}
                          </button>
                          <button class="filter-button" on:click={() => showFilterMenu = showFilterMenu === 'nome' ? null : 'nome'} title="Filtrar">
                            {filters.nome ? '🔍' : '⚙️'}
                          </button>
                          <button class="toggle-column-button" on:click={() => toggleColumnVisibility('nome')} title="Ocultar coluna">
                            👁️
                          </button>
                        </div>
                      </div>
                      {#if showFilterMenu === 'nome'}
                        <div class="filter-menu">
                          <input type="text" placeholder="Buscar CTO..." bind:value={filters.nome?.value || ''} on:input={(e) => applyFilter('nome', 'text', e.target.value)} />
                          <button on:click={() => showFilterMenu = null}>Fechar</button>
                        </div>
                      {/if}
                    </th>
                    <th class="sortable-header" class:hidden={columnVisibility.cidade === false}>
                      <div class="header-content">
                        <span>Cidade</span>
                        <div class="header-controls">
                          <button class="sort-button" on:click={() => handleSort('cidade')} title="Ordenar A-Z / Z-A">
                            {#if sortColumn === 'cidade'}
                              {sortDirection === 'asc' ? '↑' : '↓'}
                            {:else}
                              ⇅
                            {/if}
                          </button>
                          <button class="filter-button" on:click={() => showFilterMenu = showFilterMenu === 'cidade' ? null : 'cidade'} title="Filtrar">
                            {filters.cidade ? '🔍' : '⚙️'}
                          </button>
                          <button class="toggle-column-button" on:click={() => toggleColumnVisibility('cidade')} title="Ocultar coluna">
                            👁️
                          </button>
                        </div>
                      </div>
                      {#if showFilterMenu === 'cidade'}
                        <div class="filter-menu">
                          <input type="text" placeholder="Buscar cidade..." bind:value={filters.cidade?.value || ''} on:input={(e) => applyFilter('cidade', 'text', e.target.value)} />
                          <button on:click={() => showFilterMenu = null}>Fechar</button>
                        </div>
                      {/if}
                    </th>
                    <th class="sortable-header" class:hidden={columnVisibility.pop === false}>
                      <div class="header-content">
                        <span>POP</span>
                        <div class="header-controls">
                          <button class="sort-button" on:click={() => handleSort('pop')} title="Ordenar A-Z / Z-A">
                            {#if sortColumn === 'pop'}
                              {sortDirection === 'asc' ? '↑' : '↓'}
                            {:else}
                              ⇅
                            {/if}
                          </button>
                          <button class="filter-button" on:click={() => showFilterMenu = showFilterMenu === 'pop' ? null : 'pop'} title="Filtrar">
                            {filters.pop ? '🔍' : '⚙️'}
                          </button>
                          <button class="toggle-column-button" on:click={() => toggleColumnVisibility('pop')} title="Ocultar coluna">
                            👁️
                          </button>
                        </div>
                      </div>
                      {#if showFilterMenu === 'pop'}
                        <div class="filter-menu">
                          <input type="text" placeholder="Buscar POP..." bind:value={filters.pop?.value || ''} on:input={(e) => applyFilter('pop', 'text', e.target.value)} />
                          <button on:click={() => showFilterMenu = null}>Fechar</button>
                        </div>
                      {/if}
                    </th>
                    <th class="sortable-header" class:hidden={columnVisibility.chasse === false}>
                      <div class="header-content">
                        <span>CHASSE</span>
                        <div class="header-controls">
                          <button class="sort-button" on:click={() => handleSort('chasse')} title="Ordenar A-Z / Z-A">
                            {#if sortColumn === 'chasse'}
                              {sortDirection === 'asc' ? '↑' : '↓'}
                            {:else}
                              ⇅
                            {/if}
                          </button>
                          <button class="filter-button" on:click={() => showFilterMenu = showFilterMenu === 'chasse' ? null : 'chasse'} title="Filtrar">
                            {filters.chasse ? '🔍' : '⚙️'}
                          </button>
                          <button class="toggle-column-button" on:click={() => toggleColumnVisibility('chasse')} title="Ocultar coluna">
                            👁️
                          </button>
                        </div>
                      </div>
                      {#if showFilterMenu === 'chasse'}
                        <div class="filter-menu">
                          <input type="text" placeholder="Buscar CHASSE..." bind:value={filters.chasse?.value || ''} on:input={(e) => applyFilter('chasse', 'text', e.target.value)} />
                          <button on:click={() => showFilterMenu = null}>Fechar</button>
                        </div>
                      {/if}
                    </th>
                    <th class="sortable-header" class:hidden={columnVisibility.placa === false}>
                      <div class="header-content">
                        <span>PLACA</span>
                        <div class="header-controls">
                          <button class="sort-button" on:click={() => handleSort('placa')} title="Ordenar A-Z / Z-A">
                            {#if sortColumn === 'placa'}
                              {sortDirection === 'asc' ? '↑' : '↓'}
                            {:else}
                              ⇅
                            {/if}
                          </button>
                          <button class="filter-button" on:click={() => showFilterMenu = showFilterMenu === 'placa' ? null : 'placa'} title="Filtrar">
                            {filters.placa ? '🔍' : '⚙️'}
                          </button>
                          <button class="toggle-column-button" on:click={() => toggleColumnVisibility('placa')} title="Ocultar coluna">
                            👁️
                          </button>
                        </div>
                      </div>
                      {#if showFilterMenu === 'placa'}
                        <div class="filter-menu">
                          <input type="text" placeholder="Buscar PLACA..." bind:value={filters.placa?.value || ''} on:input={(e) => applyFilter('placa', 'text', e.target.value)} />
                          <button on:click={() => showFilterMenu = null}>Fechar</button>
                        </div>
                      {/if}
                    </th>
                    <th class="sortable-header" class:hidden={columnVisibility.olt === false}>
                      <div class="header-content">
                        <span>OLT</span>
                        <div class="header-controls">
                          <button class="sort-button" on:click={() => handleSort('olt')} title="Ordenar A-Z / Z-A">
                            {#if sortColumn === 'olt'}
                              {sortDirection === 'asc' ? '↑' : '↓'}
                            {:else}
                              ⇅
                            {/if}
                          </button>
                          <button class="filter-button" on:click={() => showFilterMenu = showFilterMenu === 'olt' ? null : 'olt'} title="Filtrar">
                            {filters.olt ? '🔍' : '⚙️'}
                          </button>
                          <button class="toggle-column-button" on:click={() => toggleColumnVisibility('olt')} title="Ocultar coluna">
                            👁️
                          </button>
                        </div>
                      </div>
                      {#if showFilterMenu === 'olt'}
                        <div class="filter-menu">
                          <input type="text" placeholder="Buscar OLT..." bind:value={filters.olt?.value || ''} on:input={(e) => applyFilter('olt', 'text', e.target.value)} />
                          <button on:click={() => showFilterMenu = null}>Fechar</button>
                        </div>
                      {/if}
                    </th>
                    <th class="sortable-header" class:hidden={columnVisibility.id_cto === false}>
                      <div class="header-content">
                        <span>ID CTO</span>
                        <div class="header-controls">
                          <button class="sort-button" on:click={() => handleSort('id_cto')} title="Ordenar">
                            {#if sortColumn === 'id_cto'}
                              {sortDirection === 'asc' ? '↑' : '↓'}
                            {:else}
                              ⇅
                            {/if}
                          </button>
                          <button class="filter-button" on:click={() => showFilterMenu = showFilterMenu === 'id_cto' ? null : 'id_cto'} title="Filtrar">
                            {filters.id_cto ? '🔍' : '⚙️'}
                          </button>
                          <button class="toggle-column-button" on:click={() => toggleColumnVisibility('id_cto')} title="Ocultar coluna">
                            👁️
                          </button>
                        </div>
                      </div>
                      {#if showFilterMenu === 'id_cto'}
                        <div class="filter-menu">
                          <input type="text" placeholder="Buscar ID..." bind:value={filters.id_cto?.value || ''} on:input={(e) => applyFilter('id_cto', 'text', e.target.value)} />
                          <button on:click={() => showFilterMenu = null}>Fechar</button>
                        </div>
                      {/if}
                    </th>
                    <th class="sortable-header" class:hidden={columnVisibility.portas_total === false}>
                      <div class="header-content">
                        <span>Portas Total</span>
                        <div class="header-controls">
                          <button class="sort-button" on:click={() => handleSort('portas_total')} title="Ordenar Maior/Menor">
                            {#if sortColumn === 'portas_total'}
                              {sortDirection === 'asc' ? '↑' : '↓'}
                            {:else}
                              ⇅
                            {/if}
                          </button>
                          <button class="filter-button" on:click={() => showFilterMenu = showFilterMenu === 'portas_total' ? null : 'portas_total'} title="Filtrar">
                            {filters.portas_total ? '🔍' : '⚙️'}
                          </button>
                          <button class="toggle-column-button" on:click={() => toggleColumnVisibility('portas_total')} title="Ocultar coluna">
                            👁️
                          </button>
                        </div>
                      </div>
                      {#if showFilterMenu === 'portas_total'}
                        <div class="filter-menu">
                          <select bind:value={filters.portas_total?.operator || 'greater'} on:change={(e) => applyFilter('portas_total', 'number', filters.portas_total?.value || '', e.target.value)}>
                            <option value="greater">Maior que</option>
                            <option value="less">Menor que</option>
                            <option value="equal">Igual a</option>
                            <option value="min">Mínimo</option>
                          </select>
                          <input type="number" placeholder="Valor" bind:value={filters.portas_total?.value || ''} on:input={(e) => applyFilter('portas_total', 'number', e.target.value, filters.portas_total?.operator || 'greater')} />
                          <button on:click={() => showFilterMenu = null}>Fechar</button>
                        </div>
                      {/if}
                    </th>
                    <th class="sortable-header" class:hidden={columnVisibility.ocupadas === false}>
                      <div class="header-content">
                        <span>Ocupadas</span>
                        <div class="header-controls">
                          <button class="sort-button" on:click={() => handleSort('ocupadas')} title="Ordenar Maior/Menor">
                            {#if sortColumn === 'ocupadas'}
                              {sortDirection === 'asc' ? '↑' : '↓'}
                            {:else}
                              ⇅
                            {/if}
                          </button>
                          <button class="filter-button" on:click={() => showFilterMenu = showFilterMenu === 'ocupadas' ? null : 'ocupadas'} title="Filtrar">
                            {filters.ocupadas ? '🔍' : '⚙️'}
                          </button>
                          <button class="toggle-column-button" on:click={() => toggleColumnVisibility('ocupadas')} title="Ocultar coluna">
                            👁️
                          </button>
                        </div>
                      </div>
                      {#if showFilterMenu === 'ocupadas'}
                        <div class="filter-menu">
                          <select bind:value={filters.ocupadas?.operator || 'greater'} on:change={(e) => applyFilter('ocupadas', 'number', filters.ocupadas?.value || '', e.target.value)}>
                            <option value="greater">Maior que</option>
                            <option value="less">Menor que</option>
                            <option value="equal">Igual a</option>
                            <option value="min">Mínimo</option>
                          </select>
                          <input type="number" placeholder="Valor" bind:value={filters.ocupadas?.value || ''} on:input={(e) => applyFilter('ocupadas', 'number', e.target.value, filters.ocupadas?.operator || 'greater')} />
                          <button on:click={() => showFilterMenu = null}>Fechar</button>
                        </div>
                      {/if}
                    </th>
                    <th class="sortable-header" class:hidden={columnVisibility.disponiveis === false}>
                      <div class="header-content">
                        <span>Disponíveis</span>
                        <div class="header-controls">
                          <button class="sort-button" on:click={() => handleSort('disponiveis')} title="Ordenar Maior/Menor">
                            {#if sortColumn === 'disponiveis'}
                              {sortDirection === 'asc' ? '↑' : '↓'}
                            {:else}
                              ⇅
                            {/if}
                          </button>
                          <button class="filter-button" on:click={() => showFilterMenu = showFilterMenu === 'disponiveis' ? null : 'disponiveis'} title="Filtrar">
                            {filters.disponiveis ? '🔍' : '⚙️'}
                          </button>
                          <button class="toggle-column-button" on:click={() => toggleColumnVisibility('disponiveis')} title="Ocultar coluna">
                            👁️
                          </button>
                        </div>
                      </div>
                      {#if showFilterMenu === 'disponiveis'}
                        <div class="filter-menu">
                          <select bind:value={filters.disponiveis?.operator || 'greater'} on:change={(e) => applyFilter('disponiveis', 'number', filters.disponiveis?.value || '', e.target.value)}>
                            <option value="greater">Maior que</option>
                            <option value="less">Menor que</option>
                            <option value="equal">Igual a</option>
                            <option value="min">Mínimo</option>
                          </select>
                          <input type="number" placeholder="Valor" bind:value={filters.disponiveis?.value || ''} on:input={(e) => applyFilter('disponiveis', 'number', e.target.value, filters.disponiveis?.operator || 'greater')} />
                          <button on:click={() => showFilterMenu = null}>Fechar</button>
                        </div>
                      {/if}
                    </th>
                    <th class="sortable-header" class:hidden={columnVisibility.ocupacao === false}>
                      <div class="header-content">
                        <span>Ocupação</span>
                        <div class="header-controls">
                          <button class="sort-button" on:click={() => handleSort('ocupacao')} title="Ordenar Maior/Menor">
                            {#if sortColumn === 'ocupacao'}
                              {sortDirection === 'asc' ? '↑' : '↓'}
                            {:else}
                              ⇅
                            {/if}
                          </button>
                          <button class="filter-button" on:click={() => showFilterMenu = showFilterMenu === 'ocupacao' ? null : 'ocupacao'} title="Filtrar">
                            {filters.ocupacao ? '🔍' : '⚙️'}
                          </button>
                          <button class="toggle-column-button" on:click={() => toggleColumnVisibility('ocupacao')} title="Ocultar coluna">
                            👁️
                          </button>
                        </div>
                      </div>
                      {#if showFilterMenu === 'ocupacao'}
                        <div class="filter-menu">
                          <select bind:value={filters.ocupacao?.operator || 'greater'} on:change={(e) => applyFilter('ocupacao', 'number', filters.ocupacao?.value || '', e.target.value)}>
                            <option value="greater">Maior que</option>
                            <option value="less">Menor que</option>
                            <option value="equal">Igual a</option>
                            <option value="min">Mínimo</option>
                          </select>
                          <input type="number" placeholder="Valor (%)" bind:value={filters.ocupacao?.value || ''} on:input={(e) => applyFilter('ocupacao', 'number', e.target.value, filters.ocupacao?.operator || 'greater')} />
                          <button on:click={() => showFilterMenu = null}>Fechar</button>
                        </div>
                      {/if}
                    </th>
                    <th class="sortable-header" class:hidden={columnVisibility.status === false}>
                      <div class="header-content">
                        <span>Status</span>
                        <div class="header-controls">
                          <button class="sort-button" on:click={() => handleSort('status')} title="Ordenar A-Z / Z-A">
                            {#if sortColumn === 'status'}
                              {sortDirection === 'asc' ? '↑' : '↓'}
                            {:else}
                              ⇅
                            {/if}
                          </button>
                          <button class="filter-button" on:click={() => showFilterMenu = showFilterMenu === 'status' ? null : 'status'} title="Filtrar">
                            {filters.status ? '🔍' : '⚙️'}
                          </button>
                          <button class="toggle-column-button" on:click={() => toggleColumnVisibility('status')} title="Ocultar coluna">
                            👁️
                          </button>
                        </div>
                      </div>
                      {#if showFilterMenu === 'status'}
                        <div class="filter-menu">
                          <input type="text" placeholder="Buscar status..." bind:value={filters.status?.value || ''} on:input={(e) => applyFilter('status', 'text', e.target.value)} />
                          <button on:click={() => showFilterMenu = null}>Fechar</button>
                        </div>
                      {/if}
                    </th>
                    <th class="sortable-header" class:hidden={columnVisibility.total_portas_caminho === false}>
                      <div class="header-content">
                        <span>Total de Portas no Caminho de Rede</span>
                        <div class="header-controls">
                          <button class="sort-button" on:click={() => handleSort('total_portas_caminho')} title="Ordenar Maior/Menor">
                            {#if sortColumn === 'total_portas_caminho'}
                              {sortDirection === 'asc' ? '↑' : '↓'}
                            {:else}
                              ⇅
                            {/if}
                          </button>
                          <button class="filter-button" on:click={() => showFilterMenu = showFilterMenu === 'total_portas_caminho' ? null : 'total_portas_caminho'} title="Filtrar">
                            {filters.total_portas_caminho ? '🔍' : '⚙️'}
                          </button>
                          <button class="toggle-column-button" on:click={() => toggleColumnVisibility('total_portas_caminho')} title="Ocultar coluna">
                            👁️
                          </button>
                        </div>
                      </div>
                      {#if showFilterMenu === 'total_portas_caminho'}
                        <div class="filter-menu">
                          <select bind:value={filters.total_portas_caminho?.operator || 'greater'} on:change={(e) => applyFilter('total_portas_caminho', 'number', filters.total_portas_caminho?.value || '', e.target.value)}>
                            <option value="greater">Maior que</option>
                            <option value="less">Menor que</option>
                            <option value="equal">Igual a</option>
                            <option value="min">Mínimo</option>
                          </select>
                          <input type="number" placeholder="Valor" bind:value={filters.total_portas_caminho?.value || ''} on:input={(e) => applyFilter('total_portas_caminho', 'number', e.target.value, filters.total_portas_caminho?.operator || 'greater')} />
                          <button on:click={() => showFilterMenu = null}>Fechar</button>
                        </div>
                      {/if}
                    </th>
                    <th class="sortable-header" class:hidden={columnVisibility.total_ctos_caminho === false}>
                      <div class="header-content">
                        <span>Total de CTOs no Caminho de Rede</span>
                        <div class="header-controls">
                          <button class="sort-button" on:click={() => handleSort('total_ctos_caminho')} title="Ordenar Maior/Menor">
                            {#if sortColumn === 'total_ctos_caminho'}
                              {sortDirection === 'asc' ? '↑' : '↓'}
                            {:else}
                              ⇅
                            {/if}
                          </button>
                          <button class="filter-button" on:click={() => showFilterMenu = showFilterMenu === 'total_ctos_caminho' ? null : 'total_ctos_caminho'} title="Filtrar">
                            {filters.total_ctos_caminho ? '🔍' : '⚙️'}
                          </button>
                          <button class="toggle-column-button" on:click={() => toggleColumnVisibility('total_ctos_caminho')} title="Ocultar coluna">
                            👁️
                          </button>
                        </div>
                      </div>
                      {#if showFilterMenu === 'total_ctos_caminho'}
                        <div class="filter-menu">
                          <select bind:value={filters.total_ctos_caminho?.operator || 'greater'} on:change={(e) => applyFilter('total_ctos_caminho', 'number', filters.total_ctos_caminho?.value || '', e.target.value)}>
                            <option value="greater">Maior que</option>
                            <option value="less">Menor que</option>
                            <option value="equal">Igual a</option>
                            <option value="min">Mínimo</option>
                          </select>
                          <input type="number" placeholder="Valor" bind:value={filters.total_ctos_caminho?.value || ''} on:input={(e) => applyFilter('total_ctos_caminho', 'number', e.target.value, filters.total_ctos_caminho?.operator || 'greater')} />
                          <button on:click={() => showFilterMenu = null}>Fechar</button>
                        </div>
                      {/if}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {#each filteredAndSortedCTOs as cto (getCTOKey(cto))}
                    {@const ctoKey = getCTOKey(cto)}
                    {@const isVisible = ctoVisibility.get(ctoKey) !== false}
                    {@const caminhoKey = getCaminhoRedeKey(cto)}
                    {@const total = caminhoRedeTotalsVersion >= 0 && caminhoRedeTotals ? (caminhoRedeTotals.get(caminhoKey) || 0) : 0}
                    {@const estaCarregando = caminhosCarregando && total === 0 && caminhoKey && !caminhoKey.includes('N/A') && caminhoKey !== '||||' && caminhoKey.split('|').length === 5}
                    {@const pctOcup = parseFloat(cto.pct_ocup || 0)}
                    {@const occupationClass = pctOcup < 50 ? 'low' : pctOcup >= 50 && pctOcup < 80 ? 'medium' : 'high'}
                    <tr>
                      <td class="checkbox-cell">
                        <input 
                          type="checkbox" 
                          checked={isVisible}
                          on:change={(e) => {
                            ctoVisibility.set(ctoKey, e.target.checked);
                            ctoVisibility = ctoVisibility;
                            ctoNumbersVersion++; // Forçar atualização da numeração
                            displayResultsOnMap();
                          }}
                        />
                      </td>
                      <td class="numeric" class:hidden={columnVisibility.numero === false}>{ctoNumbers.get(cto) || '-'}</td>
                      <td class="cto-name-cell" class:hidden={columnVisibility.nome === false}><strong>{cto.nome || ''}</strong></td>
                      <td class:hidden={columnVisibility.cidade === false}>{cto.cidade || 'N/A'}</td>
                      <td class:hidden={columnVisibility.pop === false}>{cto.pop || 'N/A'}</td>
                      <td class:hidden={columnVisibility.chasse === false}>{cto.olt || 'N/A'}</td>
                      <td class:hidden={columnVisibility.placa === false}>{cto.slot || 'N/A'}</td>
                      <td class:hidden={columnVisibility.olt === false}>{cto.pon || 'N/A'}</td>
                      <td class:hidden={columnVisibility.id_cto === false}>{cto.id_cto || cto.id || 'N/A'}</td>
                      <td class="numeric" class:hidden={columnVisibility.portas_total === false}>{cto.vagas_total || 0}</td>
                      <td class="numeric" class:hidden={columnVisibility.ocupadas === false}>{cto.clientes_conectados || 0}</td>
                      <td class="numeric" class:hidden={columnVisibility.disponiveis === false}>{(cto.vagas_total || 0) - (cto.clientes_conectados || 0)}</td>
                      <td class:hidden={columnVisibility.ocupacao === false}>
                        <span class="occupation-badge {occupationClass}">{pctOcup.toFixed(1)}%</span>
                      </td>
                      <td class:hidden={columnVisibility.status === false}>{cto.status_cto || 'N/A'}</td>
                      <td class="numeric" class:hidden={columnVisibility.total_portas_caminho === false}>
                        {#if estaCarregando}
                          <span class="loading-text">Carregando...</span>
                        {:else}
                          <strong>{total}</strong>
                        {/if}
                      </td>
                      <td class="numeric" class:hidden={columnVisibility.total_ctos_caminho === false}>
                        {#if estaCarregando}
                          <span class="loading-text">Carregando...</span>
                        {:else}
                          <strong>{getCaminhoRedeCTOsTotal(cto)}</strong>
                        {/if}
                      </td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
            {/if}
          </div>
        {:else if !isLoading && !error}
          <div class="empty-state" class:minimized={isTableMinimized} style="flex: {isTableMinimized ? '0 0 auto' : '1 1 auto'}; min-height: {isTableMinimized ? '60px' : '200px'};">
            <div class="table-header">
              <h3>Resultados</h3>
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
              <p>🔍 Realize uma busca para ver os resultados aqui</p>
            {/if}
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
    gap: 0.75rem; /* Espaçamento entre sidebar e área principal */
    padding: 1rem;
    padding-bottom: 1.75rem; /* Espaço na parte inferior: borda do box + pequena distância até o final */
    overflow: hidden;
    align-items: flex-start; /* Alinhar no topo, não esticar */
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
    flex: 0 0 auto; /* Largura fixa, não cresce/encolhe */
    height: calc(100% - 2.75rem); /* Altura = 100% do pai - padding top (1rem) - padding bottom (1.75rem) */
    box-sizing: border-box;
    /* Bordas sempre visíveis + pequena distância até o final da página */
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
    flex: 1 1 auto; /* Cresce para preencher espaço disponível */
    display: flex;
    flex-direction: column;
    gap: 0.75rem; /* Espaçamento entre mapa e tabela */
    overflow: hidden;
    width: 100%;
    position: relative;
    min-height: 0;
    box-sizing: border-box;
    height: calc(100% - 2.75rem); /* Altura = 100% do pai - padding top (1rem) - padding bottom (1.75rem) */
    /* Bordas sempre visíveis + pequena distância até o final da página */
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
    min-height: 300px;
    position: relative;
    border-radius: 12px;
    overflow: hidden;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    background: white;
    display: flex;
    flex-direction: column;
    flex: 0 0 auto; /* Não crescer nem encolher automaticamente */
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
  

  .results-table-container {
    background: white;
    border-radius: 12px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    padding: 1.5rem;
    display: flex;
    flex-direction: column;
    min-height: 200px;
    overflow: visible; /* Remove scroll do container externo */
    flex: 1 1 auto; /* Ocupar o espaço restante */
    width: 100%;
    max-width: 100%;
    box-sizing: border-box;
    /* Scroll apenas no .table-wrapper interno */
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
    z-index: 10000 !important;
    pointer-events: auto !important;
    touch-action: none;
  }

  .resize-handle::before {
    content: '';
    position: absolute;
    background: transparent;
    transition: background 0.2s;
    pointer-events: none; /* Não bloquear eventos no pseudo-elemento */
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
    width: 20px; /* Área clicável maior para facilitar o arraste */
    cursor: col-resize !important;
    z-index: 10000 !important; /* Z-index muito alto para ficar acima de tudo */
    pointer-events: auto !important;
    margin: 0 -8px; /* Expandir área de hover sem mudar layout */
    background: transparent; /* Mais discreto */
    position: relative;
    flex-shrink: 0;
    flex-grow: 0;
    align-self: stretch; /* Esticar na altura para funcionar com flexbox */
  }

  .resize-handle-vertical::before {
    width: 2px;
    height: 100%;
    left: 50%;
    transform: translateX(-50%);
    pointer-events: none; /* Não bloquear eventos no pseudo-elemento */
    background: rgba(100, 149, 237, 0.08); /* Mais discreto */
  }

  .resize-handle-horizontal {
    height: 20px; /* Área clicável maior para facilitar o arraste */
    cursor: row-resize !important;
    width: 100%;
    z-index: 10000 !important; /* Z-index muito alto para ficar acima de tudo */
    pointer-events: auto !important;
    position: relative;
    margin: -4px 0; /* Expandir área de hover sem mudar layout */
    background: transparent; /* Mais discreto */
    flex-shrink: 0;
    flex-grow: 0;
    align-self: stretch; /* Esticar na largura para funcionar com flexbox */
  }

  .resize-handle-horizontal::before {
    height: 2px;
    width: 100%;
    top: 50%;
    transform: translateY(-50%);
    pointer-events: none; /* Não bloquear eventos no pseudo-elemento */
    background: rgba(100, 149, 237, 0.08); /* Mais discreto */
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

  .results-table-container.minimized {
    padding: 1rem 1.5rem;
    overflow: hidden;
  }

  .results-table-container.minimized .table-header {
    margin-bottom: 0;
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

  /* Estilos CSS da tabela HTML */

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
    padding: 1.5rem;
    color: #6b7280;
    flex: 1 1 auto; /* Ocupar o espaço restante */
    min-height: 200px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    width: 100%;
    max-height: 100%;
    box-sizing: border-box;
    margin-bottom: 0;
  }

  .empty-state.minimized {
    padding: 1rem 1.5rem;
    min-height: 60px;
  }

  .empty-state.minimized .table-header {
    margin-bottom: 0;
  }

  .empty-state .table-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
    flex-shrink: 0;
  }

  .empty-state .table-header h3 {
    margin: 0;
    color: #4c1d95;
    font-size: 1.125rem;
    font-weight: 600;
  }

  .empty-state p {
    margin: 0;
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    text-align: center;
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

  /* ============================================
     ESTILOS TABELA HTML
     ============================================ */
  
  .results-table {
    width: 100%;
    border-collapse: separate;
    border-spacing: 0 0;
    font-size: 0.875rem;
    /* Adicionar espaço mínimo entre colunas para facilitar seleção individual */
    table-layout: auto;
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
    border-left: 1px solid #e5e7eb;
    white-space: nowrap;
    position: relative;
  }
  
  .results-table th.hidden,
  .results-table td.hidden {
    display: none;
  }
  
  .sortable-header {
    cursor: pointer;
    user-select: none;
  }
  
  .header-content {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    align-items: center;
  }
  
  .header-controls {
    display: flex;
    gap: 0.25rem;
    align-items: center;
    justify-content: center;
  }
  
  .sort-button,
  .filter-button,
  .toggle-column-button {
    background: transparent;
    border: 1px solid rgba(123, 104, 238, 0.3);
    border-radius: 4px;
    padding: 0.125rem 0.375rem;
    cursor: pointer;
    font-size: 0.75rem;
    color: #7B68EE;
    transition: all 0.2s;
    min-width: 24px;
    height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  
  .sort-button:hover,
  .filter-button:hover,
  .toggle-column-button:hover {
    background: rgba(100, 149, 237, 0.1);
    border-color: #7B68EE;
    color: #4c1d95;
  }
  
  .sort-button:active,
  .filter-button:active,
  .toggle-column-button:active {
    transform: scale(0.95);
  }
  
  .filter-menu {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    background: white;
    border: 2px solid #7B68EE;
    border-radius: 8px;
    padding: 0.75rem;
    z-index: 1000;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    margin-top: 0.25rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  
  .filter-menu input,
  .filter-menu select {
    padding: 0.5rem;
    border: 1px solid #e5e7eb;
    border-radius: 4px;
    font-size: 0.875rem;
    width: 100%;
    box-sizing: border-box;
  }
  
  .filter-menu button {
    padding: 0.5rem;
    background: linear-gradient(135deg, #6495ED 0%, #7B68EE 100%);
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.875rem;
    font-weight: 500;
  }
  
  .filter-menu button:hover {
    opacity: 0.9;
  }
  
  .clear-filters-button {
    background: #fee2e2;
    color: #991b1b;
    border: 1px solid #fecaca;
    border-radius: 6px;
    padding: 0.5rem 1rem;
    cursor: pointer;
    font-size: 0.875rem;
    font-weight: 500;
    margin-left: 1rem;
    transition: all 0.2s;
  }
  
  .clear-filters-button:hover {
    background: #fecaca;
    border-color: #fca5a5;
  }
  
  .results-table th:first-child {
    border-left: none;
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
    border-left: 2px solid transparent;
    border-right: 2px solid transparent;
    color: #4b5563;
    text-align: center;
    user-select: text;
    -webkit-user-select: text;
    -moz-user-select: text;
    -ms-user-select: text;
    cursor: text;
    position: relative;
    /* Prevenir que a seleção se estenda para células adjacentes */
    isolation: isolate;
    /* Criar contexto de empilhamento para isolar seleção */
    z-index: 0;
  }
  
  /* Quando uma célula está sendo selecionada, aumentar z-index para isolá-la */
  .results-table td:active {
    z-index: 1;
  }
  
  /* Prevenir seleção entre células usando pointer-events nas bordas */
  .results-table td::before,
  .results-table td::after {
    pointer-events: auto;
    user-select: none;
    -webkit-user-select: none;
  }
  
  /* Criar zona não selecionável entre colunas usando pseudo-elementos */
  .results-table td::before {
    content: '';
    position: absolute;
    left: -2px;
    top: 0;
    bottom: 0;
    width: 2px;
    background: transparent;
    user-select: none;
    -webkit-user-select: none;
    pointer-events: none;
    z-index: 1;
  }
  
  .results-table td::after {
    content: '';
    position: absolute;
    right: -2px;
    top: 0;
    bottom: 0;
    width: 2px;
    background: transparent;
    user-select: none;
    -webkit-user-select: none;
    pointer-events: none;
    z-index: 1;
  }
  
  /* Ativar bordas visíveis apenas no hover ou quando selecionado */
  .results-table td:hover,
  .results-table td:focus-within {
    border-left-color: #d1d5db;
    border-right-color: #d1d5db;
  }
  
  .results-table td:first-child {
    border-left: none;
  }
  
  .results-table td:first-child::before {
    display: none;
  }
  
  .results-table td:last-child {
    border-right: none;
  }
  
  .results-table td:last-child::after {
    display: none;
  }
  
  /* Garantir que as células tenham espaço suficiente para evitar seleção cruzada */
  .results-table td {
    box-sizing: border-box;
  }
  
  /* Separar visualmente as colunas com espaçamento interno */
  .results-table td:not(:first-child) {
    padding-left: 1.25rem;
  }
  
  .results-table td:not(:last-child) {
    padding-right: 1.25rem;
  }
  
  .results-table th:not(:first-child) {
    padding-left: 1.25rem;
  }
  
  .results-table th:not(:last-child) {
    padding-right: 1.25rem;
  }
  
  /* Garantir que as bordas das colunas sejam visíveis e separadas */
  .results-table td {
    border-left-width: 2px;
    border-right-width: 2px;
  }
  
  .results-table th {
    border-left-width: 2px;
  }
  
  .results-table th:first-child {
    border-left: none;
  }
  
  .results-table .cto-name-cell {
    white-space: nowrap;
    min-width: 150px;
    text-align: center;
    user-select: text;
    -webkit-user-select: text;
    -moz-user-select: text;
    -ms-user-select: text;
    cursor: text;
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
  
  .results-table .checkbox-cell {
    text-align: center;
    user-select: none;
    -webkit-user-select: none;
    -moz-user-select: none;
    -ms-user-select: none;
    cursor: default;
  }
  
  .results-table .checkbox-cell input[type="checkbox"] {
    cursor: pointer;
    width: 18px;
    height: 18px;
    user-select: none;
    -webkit-user-select: none;
    -moz-user-select: none;
    -ms-user-select: none;
  }
  
  .results-table .numeric {
    text-align: center;
  }
  
  .results-table .loading-text {
    color: #666;
    font-style: italic;
    font-size: 0.9em;
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
