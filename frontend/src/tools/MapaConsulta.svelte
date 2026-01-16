<script>
  // Props do componente
  export let currentUser = '';
  export let userTipo = 'user';
  export let onBackToDashboard = () => {};
  export let onSettingsRequest = null;
  export let onSettingsHover = null;
</script>

<div class="tool-container">
  <div class="tool-content">
    <p>Ferramenta em desenvolvimento...</p>
  </div>
</div>

<style>
  .tool-container {
    width: 100%;
    height: 100%;
    background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
    padding: 2rem;
    overflow-y: auto;
  }

  .tool-content {
    background: white;
    border-radius: 12px;
    padding: 2rem;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  }
</style>

