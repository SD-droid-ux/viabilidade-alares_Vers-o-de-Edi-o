<script>
  import { getAvailableTools } from './tools/toolsRegistry.js';
  
  export let onToolSelect = (toolId) => {};
  export let currentUser = '';
  export let onLogout = () => {};

  // Imagem de fundo do Dashboard
  // Altere aqui o nome do arquivo quando adicionar a nova imagem em /public
  const backgroundImage = '/dashboard-background.png'; // Troque pelo nome da sua imagem

  // Lista de ferramentas disponíveis (vem do registry)
  $: tools = getAvailableTools();

  function handleToolClick(tool) {
    if (tool.available) {
      // Abrir ferramenta em nova aba com URL específica
      const currentUrl = window.location.origin + window.location.pathname;
      const toolUrl = `${currentUrl}#/${tool.id}`;
      window.open(toolUrl, '_blank');
    }
  }

  function handleLogoutClick() {
    if (confirm('Deseja realmente sair?')) {
      onLogout();
    }
  }
</script>

<div class="dashboard-container" style="background-image: url('{backgroundImage}');">
  <header class="dashboard-header">
    <div class="header-content">
      <div class="header-left">
        <h1 class="dashboard-title">Dashboard</h1>
        <p class="dashboard-subtitle">Setor de Planejamento e Projetos - Engenharia Alares</p>
      </div>
      <div class="header-right">
        <span class="user-name">{currentUser}</span>
        <button class="logout-button" on:click={handleLogoutClick} title="Sair">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            <polyline points="16 17 21 12 16 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            <line x1="21" y1="12" x2="9" y2="12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
      </div>
    </div>
  </header>

  <main class="dashboard-main">
    <div class="main-wrapper">
      <div class="welcome-section">
        <h2 class="welcome-title">Bem-vindo, {currentUser}!</h2>
        <p class="welcome-subtitle">Selecione uma ferramenta abaixo para começar</p>
      </div>

      <div class="tools-section">
        <h2 class="section-title">Ferramentas Disponíveis</h2>
        <div class="tools-grid">
          {#each tools as tool (tool.id)}
            <button
              class="tool-card"
              class:disabled={!tool.available}
              on:click={() => handleToolClick(tool)}
              disabled={!tool.available}
            >
              <div class="tool-icon-wrapper">
                <div class="tool-icon" style="background: linear-gradient(135deg, {tool.color}15 0%, {tool.color}25 100%);">
                  <span class="icon-emoji">{tool.icon}</span>
                </div>
              </div>
              <div class="tool-content">
                <h3 class="tool-title">{tool.title}</h3>
                <p class="tool-description">{tool.description}</p>
              </div>
              <div class="tool-arrow">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M5 12h14M12 5l7 7-7 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </div>
            </button>
          {/each}
        </div>
      </div>
    </div>
  </main>
</div>

<style>
  :global(body) {
    margin: 0;
    padding: 0;
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
  }

  .dashboard-container {
    min-height: 100vh;
    background-image: url('{backgroundImage}');
    background-size: cover;
    background-position: right bottom;
    background-repeat: no-repeat;
    background-attachment: fixed;
    padding: 0;
    position: relative;
    overflow-x: hidden;
    display: flex;
    flex-direction: column;
  }

  .dashboard-container::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: linear-gradient(135deg, rgba(255, 255, 255, 0.1) 0%, rgba(255, 255, 255, 0.05) 50%, transparent 100%);
    pointer-events: none;
    z-index: 0;
  }

  .dashboard-header {
    background: linear-gradient(135deg, #7B68EE 0%, #6B5BEE 100%);
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
    padding: 1.5rem 2rem;
    position: sticky;
    top: 0;
    z-index: 100;
    width: 100%;
    box-sizing: border-box;
    position: relative;
    backdrop-filter: blur(10px);
  }

  .header-content {
    width: 100%;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1rem;
    box-sizing: border-box;
  }

  .header-left {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    flex-shrink: 1;
    min-width: 0;
  }

  .dashboard-title {
    color: white;
    font-size: 1.75rem;
    font-weight: 700;
    margin: 0;
    letter-spacing: -0.5px;
  }

  .dashboard-subtitle {
    color: rgba(255, 255, 255, 0.9);
    font-size: 0.875rem;
    margin: 0;
    font-weight: 400;
  }

  .header-right {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex-shrink: 0;
    margin-left: auto;
  }

  .user-name {
    color: white;
    font-size: 0.9375rem;
    font-weight: 500;
    padding: 0.5rem 1rem;
    background: rgba(255, 255, 255, 0.15);
    border-radius: 8px;
    backdrop-filter: blur(10px);
    white-space: nowrap;
    flex-shrink: 0;
  }

  .logout-button {
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
    flex-shrink: 0;
  }

  .logout-button:hover {
    background: rgba(255, 255, 255, 0.25);
    border-color: rgba(255, 255, 255, 0.4);
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  }

  .logout-button:active {
    transform: translateY(0);
  }

  .dashboard-main {
    flex: 1;
    width: 100%;
    display: flex;
    justify-content: center;
    align-items: flex-start;
    padding: 4rem 2rem;
    position: relative;
    z-index: 1;
  }

  .main-wrapper {
    max-width: 1200px;
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 3rem;
  }

  .welcome-section {
    text-align: center;
    padding: 2rem 0;
    animation: fadeInUp 0.6s ease-out;
    position: relative;
    z-index: 1;
  }

  .welcome-title {
    color: #ffffff;
    font-size: 2.25rem;
    font-weight: 700;
    margin: 0 0 0.75rem 0;
    letter-spacing: -0.5px;
    text-shadow: 
      0 2px 8px rgba(123, 104, 238, 0.5),
      0 4px 16px rgba(100, 149, 237, 0.3),
      0 0 20px rgba(123, 104, 238, 0.2);
    filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.1));
  }

  .welcome-subtitle {
    color: rgba(255, 255, 255, 0.95);
    font-size: 1.125rem;
    margin: 0;
    font-weight: 500;
    letter-spacing: 0.2px;
    text-shadow: 
      0 2px 6px rgba(123, 104, 238, 0.4),
      0 1px 3px rgba(100, 149, 237, 0.3),
      0 0 10px rgba(123, 104, 238, 0.2);
  }

  .tools-section {
    width: 100%;
    animation: fadeInUp 0.8s ease-out 0.2s both;
  }

  .section-title {
    color: #ffffff;
    font-size: 1.5rem;
    font-weight: 600;
    margin: 0 0 2.5rem 0;
    letter-spacing: -0.3px;
    text-align: center;
    position: relative;
    padding-bottom: 1rem;
    text-shadow: 
      0 2px 6px rgba(123, 104, 238, 0.5),
      0 1px 3px rgba(100, 149, 237, 0.4),
      0 0 15px rgba(123, 104, 238, 0.2);
  }

  .section-title::after {
    content: '';
    position: absolute;
    bottom: 0;
    left: 50%;
    transform: translateX(-50%);
    width: 60px;
    height: 3px;
    background: linear-gradient(90deg, #7B68EE 0%, #6495ED 100%);
    border-radius: 2px;
  }

  @keyframes fadeInUp {
    from {
      opacity: 0;
      transform: translateY(20px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .tools-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(340px, 1fr));
    gap: 2rem;
    justify-items: center;
    max-width: 1000px;
    margin: 0 auto;
  }

  .tool-card {
    background: rgba(255, 255, 255, 0.98);
    backdrop-filter: blur(20px) saturate(180%);
    border-radius: 20px;
    padding: 2rem;
    border: 1.5px solid rgba(255, 255, 255, 0.3);
    cursor: pointer;
    transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    position: relative;
    overflow: hidden;
    box-shadow: 
      0 8px 32px rgba(123, 104, 238, 0.15),
      0 4px 16px rgba(100, 149, 237, 0.1),
      0 2px 8px rgba(0, 0, 0, 0.05),
      inset 0 1px 0 rgba(255, 255, 255, 0.9);
    text-align: left;
    width: 100%;
    max-width: 400px;
    min-height: 220px;
  }

  .tool-card::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 4px;
    background: linear-gradient(90deg, #7B68EE 0%, #6495ED 100%);
    transform: scaleX(0);
    transform-origin: left;
    transition: transform 0.4s cubic-bezier(0.4, 0, 0.2, 1);
  }

  .tool-card::after {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: linear-gradient(135deg, rgba(123, 104, 238, 0.02) 0%, rgba(100, 149, 237, 0.02) 100%);
    opacity: 0;
    transition: opacity 0.4s cubic-bezier(0.4, 0, 0.2, 1);
    pointer-events: none;
  }

  .tool-card:hover {
    transform: translateY(-6px) scale(1.02);
    box-shadow: 
      0 16px 40px rgba(123, 104, 238, 0.25),
      0 8px 20px rgba(100, 149, 237, 0.15),
      0 4px 12px rgba(0, 0, 0, 0.1),
      inset 0 1px 0 rgba(255, 255, 255, 1);
    border-color: rgba(123, 104, 238, 0.5);
    background: rgba(255, 255, 255, 1);
  }

  .tool-card:hover::after {
    opacity: 1;
  }

  .tool-card:hover::before {
    transform: scaleX(1);
  }

  .tool-card:active {
    transform: translateY(-2px);
  }

  .tool-card.disabled {
    opacity: 0.6;
    cursor: not-allowed;
    background: #f7fafc;
  }

  .tool-card.disabled:hover {
    transform: none;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
    border-color: #e2e8f0;
  }

  .tool-icon-wrapper {
    display: flex;
    align-items: center;
    justify-content: flex-start;
  }

  .tool-icon {
    width: 72px;
    height: 72px;
    border-radius: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  }

  .tool-card:hover .tool-icon {
    transform: scale(1.1) rotate(5deg);
    box-shadow: 0 4px 16px rgba(123, 104, 238, 0.2);
  }

  .icon-emoji {
    font-size: 2rem;
    line-height: 1;
  }

  .tool-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    z-index: 1;
    position: relative;
  }

  .tool-title {
    color: #4c1d95;
    font-size: 1.25rem;
    font-weight: 600;
    margin: 0;
    letter-spacing: -0.3px;
    line-height: 1.3;
  }

  .tool-description {
    color: #5b21b6;
    font-size: 0.9375rem;
    line-height: 1.6;
    margin: 0;
    font-weight: 400;
    opacity: 0.85;
  }

  .tool-arrow {
    position: absolute;
    top: 2rem;
    right: 2rem;
    color: #7B68EE;
    opacity: 0;
    transform: translateX(-12px);
    transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
    z-index: 2;
  }

  .tool-card:hover .tool-arrow {
    opacity: 1;
    transform: translateX(0);
    color: #6495ED;
  }

  /* Responsividade */
  @media (max-width: 768px) {
    .dashboard-header {
      padding: 1.25rem 1.5rem;
    }

    .dashboard-title {
      font-size: 1.5rem;
    }

    .dashboard-subtitle {
      font-size: 0.8125rem;
    }

    .header-content {
      width: 100%;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 1rem;
    }

    .header-left {
      flex-shrink: 1;
      min-width: 0;
      overflow: hidden;
    }

    .dashboard-title {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .dashboard-subtitle {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .header-right {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      flex-shrink: 0;
      margin-left: auto;
    }

    .user-name {
      font-size: 0.875rem;
      padding: 0.4rem 0.75rem;
      max-width: 150px;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .dashboard-main {
      padding: 2.5rem 1.5rem;
    }

    .main-wrapper {
      gap: 2.5rem;
    }

    .welcome-section {
      padding: 1.5rem 0;
    }

    .welcome-title {
      font-size: 1.875rem;
    }

    .welcome-subtitle {
      font-size: 1rem;
    }

    .tools-grid {
      grid-template-columns: 1fr;
      gap: 1.5rem;
      max-width: 100%;
    }

    .tool-card {
      padding: 1.75rem;
      max-width: 100%;
      min-height: auto;
    }

    .section-title {
      font-size: 1.375rem;
      margin-bottom: 2rem;
    }
  }

  @media (max-width: 480px) {
    .dashboard-header {
      padding: 1rem;
    }

    .header-content {
      gap: 0.5rem;
    }

    .header-left {
      flex-shrink: 1;
      min-width: 0;
    }

    .dashboard-title {
      font-size: 1.25rem;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .dashboard-subtitle {
      font-size: 0.75rem;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .header-right {
      gap: 0.5rem;
    }

    .user-name {
      font-size: 0.8125rem;
      padding: 0.375rem 0.625rem;
      max-width: 100px;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .logout-button {
      padding: 0.5rem;
    }

    .dashboard-main {
      padding: 2rem 1rem;
    }

    .main-wrapper {
      gap: 2rem;
    }

    .welcome-title {
      font-size: 1.625rem;
    }

    .welcome-subtitle {
      font-size: 0.9375rem;
    }

    .section-title {
      font-size: 1.25rem;
      margin-bottom: 1.75rem;
    }

    .tools-grid {
      gap: 1.25rem;
    }

    .tool-card {
      padding: 1.5rem;
    }

    .tool-icon {
      width: 64px;
      height: 64px;
    }

    .tool-title {
      font-size: 1.125rem;
    }

    .tool-description {
      font-size: 0.875rem;
    }

    .user-name {
      font-size: 0.875rem;
      padding: 0.375rem 0.75rem;
    }
  }
</style>

