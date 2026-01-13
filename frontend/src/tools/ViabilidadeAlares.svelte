<script>
  // ============================================
  // Ferramenta: Viabilidade Alares - Engenharia
  // ============================================
  // Componente wrapper para a ferramenta de viabilidade
  // Por enquanto, este componente renderiza a interface
  // mas a lógica principal ainda está no App.svelte
  // TODO: Migrar toda a lógica para este componente
  // ============================================
  
  export let currentUser = '';
  export let userTipo = 'user';
  export let onBackToDashboard = () => {};
  
  // Props que serão passadas do App.svelte
  // Por enquanto, vamos usar um slot para renderizar o conteúdo
  // Isso permite uma migração gradual
</script>

<div class="viabilidade-tool-container">
  <!-- Este componente será expandido gradualmente -->
  <!-- Por enquanto, o conteúdo é renderizado no App.svelte -->
  <slot />
</div>

<style>
  .viabilidade-tool-container {
    width: 100%;
    height: 100%;
  }
</style>

