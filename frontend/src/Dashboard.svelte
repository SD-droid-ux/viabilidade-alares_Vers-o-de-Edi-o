<script>
  export let onToolSelect = (toolId) => {};
  export let currentUser = '';
  export let onLogout = () => {};

  // Lista de ferramentas disponíveis
  const tools = [
    {
      id: 'viabilidade-alares',
      title: 'Viabilidade Alares - Engenharia',
      description: 'Análise de viabilidade técnica para identificação de CTOs próximas a endereços de clientes',
      icon: '🏗️',
      color: '#7B68EE',
      available: true
    }
    // Futuras ferramentas serão adicionadas aqui
  ];

  function handleToolClick(tool) {
    if (tool.available) {
      onToolSelect(tool.id);
    }
  }

  function handleLogoutClick() {
    if (confirm('Deseja realmente sair?')) {
      onLogout();
    }
  }
</script>

<div class="dashboard-container">
  <header class="dashboard-header">
    <div class="header-content">
      <div class="header-left">
        <h1 class="dashboard-title">Dashboard</h1>
        <p class="dashboard-subtitle">Setor de Planejamento e Projetos - Engenharia Alares</p>
      </div>
      <div class="header-right">
        <div class="user-info">
          <span class="user-name">{currentUser}</span>
        </div>
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
            <div class="tool-icon" style="background: linear-gradient(135deg, {tool.color}15 0%, {tool.color}25 100%);">
              <span class="icon-emoji">{tool.icon}</span>
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
    background: linear-gradient(135deg, #f5f7fa 0%, #e8ecf1 100%);
    display: flex;
    flex-direction: column;
  }

  .dashboard-header {
    background: linear-gradient(135deg, #7B68EE 0%, #6B5BEE 100%);
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
    padding: 1.5rem 2rem;
    position: sticky;
    top: 0;
    z-index: 100;
  }

  .header-content {
    max-width: 1400px;
    margin: 0 auto;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .header-left {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
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
    gap: 1.5rem;
  }

  .user-info {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .user-name {
    color: white;
    font-size: 0.9375rem;
    font-weight: 500;
    padding: 0.5rem 1rem;
    background: rgba(255, 255, 255, 0.15);
    border-radius: 8px;
    backdrop-filter: blur(10px);
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
    max-width: 1400px;
    width: 100%;
    margin: 0 auto;
    padding: 3rem 2rem;
  }

  .tools-section {
    width: 100%;
  }

  .section-title {
    color: #2D3748;
    font-size: 1.5rem;
    font-weight: 600;
    margin: 0 0 2rem 0;
    letter-spacing: -0.3px;
  }

  .tools-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
    gap: 1.5rem;
  }

  .tool-card {
    background: white;
    border-radius: 16px;
    padding: 1.75rem;
    border: 1.5px solid #e2e8f0;
    cursor: pointer;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
    position: relative;
    overflow: hidden;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
    text-align: left;
  }

  .tool-card::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 4px;
    background: linear-gradient(90deg, #7B68EE 0%, #6B5BEE 100%);
    transform: scaleX(0);
    transform-origin: left;
    transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  }

  .tool-card:hover {
    transform: translateY(-4px);
    box-shadow: 0 8px 24px rgba(123, 104, 238, 0.15);
    border-color: #7B68EE;
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

  .tool-icon {
    width: 64px;
    height: 64px;
    border-radius: 14px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  }

  .tool-card:hover .tool-icon {
    transform: scale(1.1) rotate(5deg);
  }

  .icon-emoji {
    font-size: 2rem;
    line-height: 1;
  }

  .tool-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .tool-title {
    color: #2D3748;
    font-size: 1.125rem;
    font-weight: 600;
    margin: 0;
    letter-spacing: -0.2px;
  }

  .tool-description {
    color: #718096;
    font-size: 0.875rem;
    line-height: 1.5;
    margin: 0;
  }

  .tool-arrow {
    position: absolute;
    top: 1.75rem;
    right: 1.75rem;
    color: #7B68EE;
    opacity: 0;
    transform: translateX(-8px);
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  }

  .tool-card:hover .tool-arrow {
    opacity: 1;
    transform: translateX(0);
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
      flex-direction: column;
      align-items: flex-start;
      gap: 1rem;
    }

    .header-right {
      width: 100%;
      justify-content: space-between;
    }

    .dashboard-main {
      padding: 2rem 1.5rem;
    }

    .tools-grid {
      grid-template-columns: 1fr;
      gap: 1.25rem;
    }

    .tool-card {
      padding: 1.5rem;
    }
  }

  @media (max-width: 480px) {
    .dashboard-header {
      padding: 1rem;
    }

    .dashboard-main {
      padding: 1.5rem 1rem;
    }

    .section-title {
      font-size: 1.25rem;
    }

    .user-name {
      font-size: 0.875rem;
      padding: 0.375rem 0.75rem;
    }
  }
</style>


